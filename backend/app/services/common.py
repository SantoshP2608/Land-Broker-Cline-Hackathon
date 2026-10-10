"""Shared command boundary and caller-specific contract projections."""

import hashlib
import json
from datetime import timedelta
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.errors import ApiError, success
from app.core.security import require_csrf
from app.models import (
    Audit,
    CancellationCase,
    Document,
    HoldCase,
    Idempotency,
    Listing,
    OfficialCheck,
    Outbox,
    Parcel,
    Transaction,
    User,
    VerificationJob,
    new_id,
    utcnow,
)


def get_or_404(db, model, resource_id):
    try:
        resource_id = str(UUID(str(resource_id)))
    except (ValueError, TypeError):
        raise ApiError(422, "VALIDATION_ERROR", "Resource ID must be a UUID.") from None
    obj = db.get(model, resource_id)
    if obj is None:
        raise ApiError(404, "NOT_FOUND", "Resource not found.")
    return obj


def check_version(obj, expected):
    if obj.version != expected:
        raise ApiError(409, "VERSION_CONFLICT", "The resource changed. Refetch before acting.")


def lock_parcel(db, parcel_id):
    parcel = db.scalar(
        select(Parcel)
        .where(Parcel.id == parcel_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if parcel is None:
        raise ApiError(404, "NOT_FOUND", "Parcel not found.")
    return parcel


def check_identity(user):
    if user.disabled or user.identity_status != "CONFIRMED":
        raise ApiError(409, "IDENTITY_NOT_CONFIRMED", "A confirmed simulated identity is required.")


def assigned_user(db, role):
    users = db.scalars(select(User).where(User.disabled.is_(False)).order_by(User.id)).all()
    for user in users:
        if role in user.roles:
            return user.id
    raise ApiError(503, "DEPENDENCY_UNAVAILABLE", f"No {role.lower()} is provisioned.", retryable=True)


def command(request, db, user, payload, fn, status=200):
    require_csrf(request, user)
    raw_key = request.headers.get("Idempotency-Key", "")
    try:
        key = str(UUID(raw_key))
    except (ValueError, TypeError):
        raise ApiError(422, "VALIDATION_ERROR", "Idempotency-Key must be a UUID.") from None
    route = request.url.path
    encoded = json.dumps(jsonable_encoder(payload), sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    # Serialize retries across processes without holding a long-running provider call.
    lock_key = int.from_bytes(
        hashlib.sha256(f"{user.id}|{request.method}|{route}|{key}".encode()).digest()[:8], "big", signed=True
    )
    from sqlalchemy import text

    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
    record = db.scalar(
        select(Idempotency).where(
            Idempotency.actor_id == user.id,
            Idempotency.method == request.method,
            Idempotency.route == route,
            Idempotency.key == key,
        )
    )
    if record is not None:
        if record.request_hash != digest:
            db.rollback()
            raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This key was used with different input.")
        if record.response_body is not None:
            result = JSONResponse(record.response_body, status_code=record.response_status)
            db.rollback()
            return result
    else:
        record = Idempotency(
            actor_id=user.id, method=request.method, route=route, key=key, request_hash=digest
        )
        db.add(record)
    try:
        # Keep the command advisory lock while rolling back failed business work.
        # The outer record survives the savepoint; no partial domain writes do.
        db.flush()
        with db.begin_nested():
            data = fn()
            db.flush()
            # JSONResponse bypasses FastAPI response validation; check before commit.
            from app.schemas import Envelope, response_type

            route_path = request.scope["route"].path.removeprefix("/api/v1")
            response_model = response_type(route_path, request.method)
            if response_model is not None:
                Envelope[response_model].model_validate(success(request, data))
        body = jsonable_encoder(success(request, data))
        record.response_status = status
        record.response_body = body
        db.commit()
        return JSONResponse(body, status_code=status)
    except ApiError as exc:
        # Retryable dependencies are deliberately not stored as terminal outcomes.
        if exc.retryable:
            db.commit()
        elif exc.status < 500:
            body = {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "field_errors": exc.field_errors or {},
                    "retryable": False,
                },
                "meta": {"request_id": request.state.request_id, "contract_version": "0.1"},
            }
            record.response_status = exc.status
            record.response_body = body
            db.commit()
        else:
            db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise ApiError(
            409, "INVALID_TRANSITION", "A competing command changed this resource. Refetch."
        ) from None
    except Exception:
        db.rollback()
        raise


def audit(db, user, resource, action, previous, next, reason=None, recipients=None):
    resource_id = resource if isinstance(resource, str) else resource.id
    db.add(
        Audit(
            actor_id=user.id if user else None,
            resource_id=resource_id,
            action=action,
            previous_state=previous,
            next_state=next,
            reason=reason,
        )
    )
    db.add(
        Outbox(
            event_id=new_id(),
            recipients=list(dict.fromkeys(recipients or [])),
            payload={"summary": action.replace("_", " ").title(), "resource_id": resource_id},
            next_attempt_at=utcnow(),
        )
    )


def official_check(db, parcel):
    if not parcel.official_available or parcel.official_status == "UNKNOWN":
        raise ApiError(
            503,
            "OFFICIAL_STATUS_UNKNOWN",
            "The simulated registry is unavailable; reservation is retained.",
            retryable=True,
        )
    check = OfficialCheck(
        parcel_id=parcel.id,
        status=parcel.official_status,
        mode="SIMULATED",
        source="Synthetic Karnataka registry",
        as_of=utcnow(),
        expires_at=utcnow() + timedelta(seconds=settings.official_check_max_age_seconds),
        authority_revision=parcel.authority_revision,
    )
    db.add(check)
    db.flush()
    if parcel.official_status == "TRANSFER_RECORDED":
        raise ApiError(409, "PARCEL_NOT_AVAILABLE", "The registry already records a transfer.")
    return check


def latest_check(db, parcel_id):
    return db.scalar(
        select(OfficialCheck).where(OfficialCheck.parcel_id == parcel_id).order_by(OfficialCheck.as_of.desc())
    )


def iso(value):
    return value.isoformat().replace("+00:00", "Z") if value else None


def official_dto(check):
    if not check:
        return None
    return {
        "id": check.id,
        "status": check.status,
        "mode": check.mode,
        "source": check.source,
        "as_of": iso(check.as_of),
        "expires_at": iso(check.expires_at),
        "authority_revision": check.authority_revision,
    }


def availability(db, listing):
    parcel = get_or_404(db, Parcel, listing.parcel_id)
    if parcel.status == "TRANSFERRED" or parcel.official_status == "TRANSFER_RECORDED":
        return "TRANSFERRED"
    hold = db.scalar(
        select(HoldCase.id).where(
            HoldCase.parcel_id == parcel.id, HoldCase.status.in_(["OPEN", "UNDER_REVIEW"])
        )
    )
    if hold or parcel.status == "HOLD":
        return "ON_HOLD"
    tx = db.scalar(
        select(Transaction).where(Transaction.parcel_id == parcel.id, Transaction.closed_at.is_(None))
    )
    if tx:
        return {
            "CANCELLATION_PENDING": "CANCELLATION_PENDING",
            "HOLD": "ON_HOLD",
            "REGISTRATION_PENDING": "REGISTRATION_PENDING",
        }.get(tx.status, "RESERVED")
    seller = db.get(User, listing.seller_id)
    from app.services.verification import document_set_hash

    if (
        listing.status == "PUBLISHED"
        and listing.approved_document_set_hash
        and parcel.status == "OPEN"
        and seller
        and not seller.disabled
        and seller.identity_status == "CONFIRMED"
        and parcel.owner_id == seller.id
        and parcel.official_status == "CURRENT"
        and parcel.official_available
        and listing.approved_document_set_hash == document_set_hash(db, listing.id)
    ):
        # The isolated simulator is the authoritative local source, not a delayed external feed.
        return "AVAILABLE"
    return "UNCONFIRMED"


def listing_dto(db, listing, user, private=False):
    parcel = get_or_404(db, Parcel, listing.parcel_id)
    available = availability(db, listing)
    actions = []
    seller = user and user.id == listing.seller_id
    if seller:
        if (
            listing.status in ["DRAFT", "CHANGES_REQUIRED", "APPROVED"]
            and not parcel.active_transaction_id
            and parcel.status == "OPEN"
        ):
            actions += ["EDIT_LISTING", "UPLOAD_DOCUMENT"]
        if listing.status in ["DRAFT", "CHANGES_REQUIRED"] and parcel.status == "OPEN":
            actions += ["SUBMIT_REVIEW"]
        if listing.status == "APPROVED" and parcel.status == "OPEN" and parcel.official_available:
            actions += ["PUBLISH_LISTING"]
        if available == "AVAILABLE":
            actions += ["ACCEPT_INVITATION", "DECLINE_INVITATION"]
    elif (
        user
        and "REVIEWER" in user.roles
        and listing.assigned_reviewer_id == user.id
        and listing.status == "UNDER_REVIEW"
    ):
        actions += ["REVIEW_LISTING"]
    elif available == "AVAILABLE" and (
        not user or (user.identity_status == "CONFIRMED" and not user.disabled)
    ):
        actions += ["SEND_INVITATION"]
    result = {
        "id": listing.id,
        "version": listing.version,
        "status": listing.status,
        "availability": available,
        "title": listing.title,
        "description": listing.description,
        "area_sqm": f"{parcel.area_sqm:.2f}",
        "land_type": listing.land_type,
        "asking_price_inr": f"{listing.asking_price_inr:.2f}",
        "location": parcel.location,
        "photo_urls": [],
        "review_summary": {
            "reviewed_at": iso(listing.reviewed_at),
            "scope": "Synthetic whole-parcel demonstration review; no legal title guarantee.",
            "integration_mode": "SIMULATED",
        },
        "allowed_actions": actions,
    }
    if private:
        docs = db.scalars(
            select(Document.id).where(Document.owner_kind == "LISTING", Document.owner_id == listing.id)
        ).all()
        job = db.scalar(
            select(VerificationJob)
            .where(VerificationJob.listing_id == listing.id)
            .order_by(VerificationJob.created_at.desc())
        )
        result.update(
            seller_id=listing.seller_id,
            parcel={
                "id": parcel.id,
                "version": parcel.version,
                "status": parcel.status,
                "active_transaction_id": parcel.active_transaction_id,
                "official_check": official_dto(latest_check(db, parcel.id)),
            },
            document_ids=list(docs),
            finding_ids=[f["id"] for f in (job.findings or [])] if job else [],
            blocked_reason=None
            if available == "AVAILABLE" or actions
            else "Review, identity or parcel eligibility is incomplete.",
        )
    return result


def transaction_dto(db, tx, user):
    listing = get_or_404(db, Listing, tx.listing_id)
    actions = []
    party = user and user.id in [tx.seller_id, tx.buyer_id]
    if party:
        if tx.status == "DISCUSSION":
            actions += ["RECORD_OUTCOME", "REQUEST_CANCELLATION", "UPLOAD_DOCUMENT"]
        elif tx.status == "AGREEMENT_PREPARATION":
            actions += ["SET_TERMS", "REQUEST_CANCELLATION", "UPLOAD_DOCUMENT"]
            if tx.terms:
                actions += ["GENERATE_DEED"]
            if tx.draft_hash and user.id not in (tx.confirmed_by or []):
                actions += ["CONFIRM_DEED"]
            if set(tx.confirmed_by or []) == {tx.seller_id, tx.buyer_id} and tx.draft_hash:
                actions += ["SUBMIT_REGISTRATION"]
        elif tx.status == "REGISTRATION_PENDING":
            actions += ["REQUEST_CANCELLATION"]
        elif tx.status == "CANCELLATION_PENDING":
            case = db.get(CancellationCase, tx.cancellation_case_id) if tx.cancellation_case_id else None
            if case and case.requested_by != user.id:
                actions += ["RESPOND_CANCELLATION"]
        elif tx.status == "HOLD":
            actions += ["SUBMIT_EVIDENCE", "UPLOAD_DOCUMENT"]
    elif user:
        if (
            "REGISTRAR" in user.roles
            and tx.assigned_registrar_id == user.id
            and tx.status == "REGISTRATION_PENDING"
        ):
            actions += ["REVIEW_REGISTRATION", "SIMULATE_COMPLETION"]
        case = db.get(CancellationCase, tx.cancellation_case_id) if tx.cancellation_case_id else None
        hold = db.get(HoldCase, tx.hold_case_id) if tx.hold_case_id else None
        if "REVIEWER" in user.roles:
            if (
                case
                and case.assigned_reviewer_id == user.id
                and case.status not in ["CLOSED_RELEASED", "CLOSED_NO_RELEASE"]
            ):
                actions += ["REVIEW_CANCELLATION"]
            if hold and hold.assigned_reviewer_id == user.id and hold.status in ["OPEN", "UNDER_REVIEW"]:
                actions += ["REVIEW_HOLD"]
    return {
        "id": tx.id,
        "version": tx.version,
        "listing_id": tx.listing_id,
        "parcel_id": tx.parcel_id,
        "seller_id": tx.seller_id,
        "buyer_id": tx.buyer_id,
        "status": tx.status,
        "resume_state": tx.resume_state,
        "closed_at": iso(tx.closed_at),
        "availability": availability(db, listing),
        "commitments": tx.commitments,
        "terms": tx.terms,
        "draft_document_id": tx.draft_document_id,
        "draft_hash": tx.draft_hash,
        "confirmed_by": tx.confirmed_by or [],
        "cancellation_case_id": tx.cancellation_case_id,
        "hold_case_id": tx.hold_case_id,
        "official_check": official_dto(latest_check(db, tx.parcel_id)),
        "integration_mode": "SIMULATED",
        "allowed_actions": actions,
        "blocked_reason": None
        if actions or tx.closed_at
        else "Waiting for the other party or assigned officer.",
    }


def invitation_dto(db, inv, user):
    listing = get_or_404(db, Listing, inv.listing_id)
    actions = []
    if inv.status == "PENDING":
        if user.id == inv.buyer_id:
            actions += ["WITHDRAW_INVITATION"]
        elif user.id == listing.seller_id:
            actions += ["DECLINE_INVITATION"]
            if availability(db, listing) == "AVAILABLE":
                actions += ["ACCEPT_INVITATION"]
    return {
        "id": inv.id,
        "version": inv.version,
        "listing_id": inv.listing_id,
        "buyer_id": inv.buyer_id,
        "status": inv.status,
        "created_at": iso(inv.created_at),
        "allowed_actions": actions,
    }


def cancellation_dto(case):
    fields = [
        "id",
        "version",
        "transaction_id",
        "status",
        "requested_by",
        "reason",
        "stage_at_request",
        "claimed_commitments",
        "evidence_document_ids",
        "responses",
        "resolution_reason",
        "official_check_id",
    ]
    return {
        **{f: getattr(case, f) for f in fields},
        "response_due_at": iso(case.response_due_at),
        "resolved_at": iso(case.resolved_at),
    }


def hold_dto(case):
    fields = [
        "id",
        "version",
        "parcel_id",
        "transaction_id",
        "status",
        "reason_code",
        "summary",
        "evidence_document_ids",
        "assigned_reviewer_id",
        "resolution_reason",
    ]
    return {
        **{f: getattr(case, f) for f in fields},
        "response_due_at": iso(case.response_due_at),
        "resolved_at": iso(case.resolved_at),
    }


def document_dto(doc):
    return {
        "id": doc.id,
        "owner_kind": doc.owner_kind,
        "owner_id": doc.owner_id,
        "document_type": doc.document_type,
        "version": doc.version,
        "filename": doc.filename,
        "sha256": doc.sha256,
        "uploaded_at": iso(doc.uploaded_at),
        "sharing_scope": doc.sharing_scope,
        "authenticity": {
            "status": "NOT_AUTHENTICATED",
            "source": "Synthetic demo upload",
            "checked_at": None,
        },
    }


def job_dto(job):
    return {
        "id": job.id,
        "listing_id": job.listing_id,
        "status": job.status,
        "mode": job.mode,
        "finding_ids": [f["id"] for f in (job.findings or [])],
        "error_message": job.error_message,
        "created_at": iso(job.created_at),
        "completed_at": iso(job.completed_at),
    }


def page(items, cursor=None, limit=20):
    start = 0
    if cursor:
        try:
            start = next(
                i + 1 for i, item in enumerate(items) if item.get("id", item.get("resource_id")) == cursor
            )
        except StopIteration:
            raise ApiError(422, "VALIDATION_ERROR", "Unknown pagination cursor.") from None
    selected = items[start : start + limit]
    more = start + limit < len(items)
    return {
        "items": selected,
        "next_cursor": selected[-1].get("id", selected[-1].get("resource_id")) if more else None,
    }
