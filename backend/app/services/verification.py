"""Cline SDK extraction, deterministic comparisons and stale-job fencing.

Government records stay synthetic. Jobs never change listing status. Offline
simulation is an explicit setting, never a fallback after SDK failure.
"""

import hashlib
import json
import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID, uuid5

from sqlalchemy import and_, or_, select

from app.core.config import settings
from app.core.errors import ApiError
from app.domain import decimal_string
from app.models import Document, Listing, Parcel, User, VerificationJob, utcnow
from app.services.documents import inspect_content, read_document

REQUIRED_TYPES = ("PREVIOUS_DEED", "LAND_RECORD", "ENCUMBRANCE_CERTIFICATE")
POLICY_VERSION = "KA-SYNTHETIC-0.1"


def extraction_policy_version():
    if settings.document_extraction_backend == "SIMULATED":
        return POLICY_VERSION
    selection = json.dumps(
        [
            settings.cline_provider_id,
            settings.cline_model_id,
            settings.cline_base_url,
            settings.cline_min_confidence,
        ],
    )
    digest = hashlib.sha256(selection.encode()).hexdigest()[:12]
    return f"KA-SYNTHETIC-0.1:CLINE-0.0.92:{digest}"


def document_set_hash(db, listing_id) -> str:
    """Bind all immutable document versions and configured comparison sources."""
    db.flush()
    listing = db.get(Listing, listing_id, populate_existing=True)
    if listing is None:
        raise ApiError(404, "NOT_FOUND", "Listing not found.")
    parcel = db.get(Parcel, listing.parcel_id, populate_existing=True)
    seller = db.get(User, listing.seller_id, populate_existing=True)
    docs = db.scalars(
        select(Document)
        .where(Document.owner_kind == "LISTING", Document.owner_id == listing_id)
        .order_by(Document.id)
        .execution_options(populate_existing=True)
    ).all()
    payload = {
        "extraction_policy": extraction_policy_version(),
        "documents": [[doc.id, doc.document_type, doc.version, doc.sha256] for doc in docs],
        "parcel": {
            "id": parcel.id,
            "owner": parcel.owner_id,
            "location": parcel.location,
            "area_sqm": decimal_string(parcel.area_sqm),
            "authority_revision": parcel.authority_revision,
        },
        "seller": {"id": listing.seller_id, "subject_ref": seller.subject_ref if seller else None},
        "listing": {
            "land_type": listing.land_type,
            "original_area": listing.original_area,
            "original_unit": listing.original_unit,
        },
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def current_completed_job(db, listing_id):
    digest = document_set_hash(db, listing_id)
    return db.scalar(
        select(VerificationJob)
        .where(
            VerificationJob.listing_id == listing_id,
            VerificationJob.document_set_hash == digest,
            VerificationJob.policy_version == extraction_policy_version(),
            VerificationJob.status == "COMPLETED",
            VerificationJob.mode == "SIMULATED",
        )
        .order_by(VerificationJob.created_at.desc(), VerificationJob.id.desc())
    )


def _finding(job_id, key, status, summary, left=None, right=None):
    fields = {
        "document_id",
        "document_version",
        "page_number",
        "field_name",
        "value",
        "source_date",
        "confidence",
    }
    left = {key: value for key, value in left.items() if key in fields} if left else None
    right = {key: value for key, value in right.items() if key in fields} if right else None
    return {
        "id": str(uuid5(UUID(job_id), key)),
        "rule_code": key.split(":")[0],
        "status": status,
        "summary": summary,
        "left_evidence": left,
        "right_evidence": right,
        "reviewer_disposition": None,
    }


def _evidence(doc, page, field, raw, normalized):
    return {
        "document_id": doc["id"],
        "document_version": doc["version"],
        "page_number": page,
        "field_name": field,
        "value": raw,
        "raw_value": raw,
        "normalized_value": normalized,
        "source_date": None,
        "confidence": "1.00",
    }


def extract_findings(job_id, documents, sources):
    findings = []
    for document_type in REQUIRED_TYPES:
        doc = documents.get(document_type)
        if doc is None:
            findings.append(
                _finding(
                    job_id,
                    f"REQUIRED_DOCUMENT:{document_type}",
                    "EVIDENCE_MISSING",
                    f"Required {document_type.lower().replace('_', ' ')} is missing.",
                )
            )
            continue
        if doc.get("parse_error"):
            findings.append(
                _finding(
                    job_id,
                    f"SAFE_EXTRACTION:{doc['id']}",
                    "MANUAL_REVIEW",
                    "Evidence could not be safely extracted; review is required.",
                )
            )
            continue
        pages = doc["pages"]
        if not any("SYNTHETIC" in page.upper() for page in pages):
            findings.append(
                _finding(
                    job_id,
                    f"SYNTHETIC_SCOPE:{doc['id']}",
                    "MANUAL_REVIEW",
                    "Only explicitly synthetic text is comparable in this demonstration.",
                )
            )
            continue
        if settings.document_extraction_backend == "CLINE_SDK":
            from app.services.cline_extraction import compare_document, extract_document

            extraction = extract_document(doc)
            for field, status, summary, left, right in compare_document(doc, extraction, sources):
                findings.append(
                    _finding(job_id, f"SOURCE_{field.upper()}:{doc['id']}", status, summary, left, right)
                )
            continue
        for field, prefix in (
            ("survey_number", "Survey"),
            ("area_sqm", "Area sqm"),
            ("owner_subject_ref", "Owner subject"),
        ):
            matches = []
            for number, page in enumerate(pages, 1):
                for match in re.finditer(
                    rf"^{re.escape(prefix)}\s*:\s*([^\r\n]+)$", page, re.MULTILINE | re.IGNORECASE
                ):
                    raw = match.group(1).strip()
                    normalized = raw
                    if field == "area_sqm":
                        try:
                            if not re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", raw):
                                raise ValueError()
                            normalized = decimal_string(Decimal(raw))
                        except (ValueError, InvalidOperation):
                            normalized = None
                    matches.append(_evidence(doc, number, field, raw, normalized))
            key = f"SOURCE_{field.upper()}:{doc['id']}"
            # Configured simulator records are not uploaded documents: never invent evidence IDs/pages.
            right = None
            if (
                not matches
                or not sources.get(field)
                or any(item["normalized_value"] is None for item in matches)
            ):
                findings.append(
                    _finding(
                        job_id,
                        key,
                        "MANUAL_REVIEW",
                        f"{field} is missing or uncertain; no match is inferred.",
                        matches[0] if matches else None,
                        right,
                    )
                )
            elif len({item["normalized_value"] for item in matches}) != 1:
                findings.append(
                    _finding(
                        job_id,
                        key,
                        "DISCREPANCY",
                        f"Conflicting {field} values appear in this document.",
                        matches[0],
                        next(
                            item
                            for item in matches
                            if item["normalized_value"] != matches[0]["normalized_value"]
                        ),
                    )
                )
            else:
                matched = matches[0]["normalized_value"] == sources[field]
                findings.append(
                    _finding(
                        job_id,
                        key,
                        "MATCHES_SOURCE" if matched else "DISCREPANCY",
                        f"Synthetic {field} normalized as {matches[0]['normalized_value']} {'matches' if matched else 'differs from'} configured synthetic record {sources[field]}; not an authenticity determination.",
                        matches[0],
                        right,
                    )
                )
    return findings


def process_jobs(db, limit=10):
    """Commit leased claims before parsing; compare attempt on completion/reclaim."""
    processed = []
    for _ in range(limit):
        now = utcnow()
        job = db.scalar(
            select(VerificationJob)
            .where(
                or_(
                    VerificationJob.status == "QUEUED",
                    and_(VerificationJob.status == "RUNNING", VerificationJob.lease_until < now),
                )
            )
            .order_by(VerificationJob.created_at, VerificationJob.id)
            .with_for_update(skip_locked=True)
            .execution_options(populate_existing=True)
            .limit(1)
        )
        if job is None:
            db.rollback()
            break
        job.status = "RUNNING"
        job.attempt += 1
        job.lease_until = now + timedelta(seconds=settings.cline_timeout_seconds * len(REQUIRED_TYPES) + 120)
        job.error_message = None
        job_id, attempt, listing_id, digest = job.id, job.attempt, job.listing_id, job.document_set_hash
        mode, policy = job.mode, job.policy_version
        db.commit()
        error = None
        findings = []
        try:
            if mode != "SIMULATED" or policy != extraction_policy_version():
                raise ValueError("Extraction policy changed; submit a current verification job.")
            if document_set_hash(db, listing_id) != digest:
                raise ValueError("Document set changed before extraction; submit a current review job.")
            listing = db.get(Listing, listing_id)
            parcel = db.get(Parcel, listing.parcel_id)
            seller = db.get(User, listing.seller_id)
            sources = {
                "survey_number": parcel.location.get("survey_number"),
                "area_sqm": decimal_string(parcel.area_sqm),
                "owner_subject_ref": seller.subject_ref,
            }
            docs = db.scalars(
                select(Document)
                .where(Document.owner_kind == "LISTING", Document.owner_id == listing_id)
                .order_by(Document.uploaded_at.desc(), Document.id.desc())
            ).all()
            snapshots = {}
            for doc in docs:
                if doc.document_type in REQUIRED_TYPES and doc.document_type not in snapshots:
                    snapshots[doc.document_type] = {
                        "id": doc.id,
                        "version": doc.version,
                        "sha256": doc.sha256,
                        "document_type": doc.document_type,
                        "content": read_document(doc),
                    }
            if document_set_hash(db, listing_id) != digest:
                raise ValueError("Document set changed while snapshotting.")
            db.commit()
            for snapshot in snapshots.values():
                try:
                    snapshot["pages"] = inspect_content(snapshot.pop("content"))["pages"]
                except ApiError:
                    snapshot["parse_error"] = True
            findings = extract_findings(job_id, snapshots, sources)
        except ApiError:
            error = "Private evidence could not be read safely; retry with a new verification request."
            db.rollback()
        except Exception as exc:
            from app.services.cline_extraction import ExtractionError

            if isinstance(exc, ExtractionError):
                error = f"Cline SDK extraction failed ({exc.code}); configure/recover the provider and submit verification again. No simulated fallback was used."
            else:
                error = (
                    "Verification could not finish safely; review source documents and worker configuration."
                )
            db.rollback()
        # Acquire parcel before job to match the aggregate lock order. A document
        # update during the model call must never become a current approval input.
        from app.services.common import lock_parcel

        listing = db.get(Listing, listing_id)
        if listing:
            lock_parcel(db, listing.parcel_id)
            db.refresh(listing)
            if policy != extraction_policy_version() or document_set_hash(db, listing_id) != digest:
                error = "Evidence or extraction policy changed during processing; submit a current verification job."
        final = db.scalar(
            select(VerificationJob)
            .where(
                VerificationJob.id == job_id,
                VerificationJob.status == "RUNNING",
                VerificationJob.attempt == attempt,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if final is None:
            db.rollback()
            continue
        final.findings = findings if not error else []
        final.status = "FAILED" if error else "COMPLETED"
        final.error_message = error
        final.completed_at = utcnow()
        final.lease_until = None
        db.commit()
        processed.append(job_id)
    return processed
