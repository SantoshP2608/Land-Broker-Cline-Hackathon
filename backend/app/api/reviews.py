"""Provisioned officers see assigned work only; identity and listing decisions."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.identity import identity_dto
from app.core.errors import ApiError, success
from app.core.security import current_user
from app.db import get_db
from app.domain import iso_utc
from app.models import (
    CancellationCase,
    Document,
    HoldCase,
    IdentitySubmission,
    Listing,
    Transaction,
    User,
    utcnow,
)
from app.services.common import audit, check_version, command, get_or_404, listing_dto, lock_parcel, page
from app.services.documents import authorized_document, read_document
from app.services.verification import REQUIRED_TYPES, current_completed_job, document_set_hash

router = APIRouter(tags=["reviews"])


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_version: int = Field(ge=1, strict=True)
    reason: str = Field(min_length=1, max_length=5000)


class IdentityDecision(Decision):
    decision: Literal["CONFIRM", "REQUEST_CHANGES", "REJECT"]


class ListingDecision(Decision):
    decision: Literal["APPROVE", "REQUEST_CHANGES", "REJECT"]
    evidence_document_ids: list[UUID] = Field(default_factory=list, max_length=50)


def require_assigned(obj, user):
    if "REVIEWER" not in user.roles or obj.assigned_reviewer_id != user.id:
        raise ApiError(404, "NOT_FOUND", "Assigned review not found.")


def locked(db, model, id):
    obj = db.scalar(
        select(model).where(model.id == id).with_for_update().execution_options(populate_existing=True)
    )
    if obj is None:
        raise ApiError(404, "NOT_FOUND", "Review not found.")
    return obj


def queue_item(kind, obj, title, transaction_version=None, due_at=None):
    return {
        "kind": kind,
        "resource_id": obj.id,
        "version": obj.version,
        "transaction_version": transaction_version,
        "title": title,
        "assigned_at": iso_utc(obj.created_at),
        "due_at": iso_utc(due_at),
    }


@router.get("/reviews/queue")
def queue(
    request: Request,
    kind: Literal["IDENTITY", "LISTING", "CANCELLATION", "HOLD", "REGISTRATION"] | None = None,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=50),
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    if not {"REVIEWER", "REGISTRAR"}.intersection(user.roles):
        raise ApiError(403, "FORBIDDEN", "Provisioned officer access is required.")
    items = []
    if "REVIEWER" in user.roles:
        submissions = db.scalars(
            select(IdentitySubmission).where(
                IdentitySubmission.assigned_reviewer_id == user.id,
                IdentitySubmission.status == "PENDING",
                IdentitySubmission.reason.is_(None),
            )
        ).all()
        for submission in submissions:
            latest = db.scalar(
                select(IdentitySubmission.id)
                .where(IdentitySubmission.user_id == submission.user_id)
                .order_by(IdentitySubmission.created_at.desc(), IdentitySubmission.id.desc())
                .limit(1)
            )
            if latest == submission.id:
                items.append(queue_item("IDENTITY", submission, "Synthetic identity review"))
        for listing in db.scalars(
            select(Listing).where(Listing.assigned_reviewer_id == user.id, Listing.status == "UNDER_REVIEW")
        ).all():
            items.append(queue_item("LISTING", listing, listing.title))
        for case in db.scalars(
            select(CancellationCase).where(
                CancellationCase.assigned_reviewer_id == user.id,
                CancellationCase.status.in_(["REQUESTED", "UNDER_REVIEW", "HOLD"]),
            )
        ).all():
            tx = get_or_404(db, Transaction, case.transaction_id)
            items.append(
                queue_item("CANCELLATION", case, "Cancellation review", tx.version, case.response_due_at)
            )
        for case in db.scalars(
            select(HoldCase).where(
                HoldCase.assigned_reviewer_id == user.id, HoldCase.status.in_(["OPEN", "UNDER_REVIEW"])
            )
        ).all():
            tx = db.get(Transaction, case.transaction_id) if case.transaction_id else None
            items.append(
                queue_item("HOLD", case, "Hold review", tx.version if tx else None, case.response_due_at)
            )
    if "REGISTRAR" in user.roles:
        for tx in db.scalars(
            select(Transaction).where(
                Transaction.assigned_registrar_id == user.id, Transaction.status == "REGISTRATION_PENDING"
            )
        ).all():
            items.append(queue_item("REGISTRATION", tx, "Synthetic registration application", tx.version))
    if kind:
        items = [item for item in items if item["kind"] == kind]
    return success(
        request,
        page(sorted(items, key=lambda item: (item["assigned_at"], item["resource_id"])), cursor, limit),
    )


@router.post("/reviews/identity/{submission_id}/decision")
def identity_decision(
    submission_id: UUID,
    body: IdentityDecision,
    request: Request,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    require_assigned(get_or_404(db, IdentitySubmission, str(submission_id)), user)

    def run():
        initial = get_or_404(db, IdentitySubmission, str(submission_id))
        require_assigned(initial, user)
        owner = locked(db, User, initial.user_id)
        submission = locked(db, IdentitySubmission, initial.id)
        require_assigned(submission, user)
        check_version(submission, body.expected_version)
        latest = db.scalar(
            select(IdentitySubmission.id)
            .where(IdentitySubmission.user_id == owner.id)
            .order_by(IdentitySubmission.created_at.desc(), IdentitySubmission.id.desc())
            .limit(1)
        )
        if latest != submission.id or submission.status != "PENDING" or submission.reason is not None:
            raise ApiError(
                409, "INVALID_TRANSITION", "Only the current awaiting-review submission may be decided."
            )
        if submission.mode != "SIMULATED":
            raise ApiError(
                503, "DEPENDENCY_UNAVAILABLE", "No connected identity adapter is configured.", retryable=True
            )
        if body.decision == "CONFIRM":
            if not submission.document_ids or not submission.consent_at or owner.disabled:
                raise ApiError(409, "INVALID_TRANSITION", "Consented identity evidence is required.")
            for id in submission.document_ids:
                doc = get_or_404(db, Document, id)
                if (
                    doc.owner_kind != "USER"
                    or doc.owner_id != owner.id
                    or doc.document_type != "IDENTITY"
                    or doc.sharing_scope != "OWNER_AND_OFFICERS"
                ):
                    raise ApiError(422, "VALIDATION_ERROR", "Current private identity evidence is required.")
                authorized_document(db, doc, user)
                read_document(doc)
        previous = submission.status
        submission.status = {"CONFIRM": "CONFIRMED", "REQUEST_CHANGES": "PENDING", "REJECT": "FAILED"}[
            body.decision
        ]
        submission.reason = body.reason
        submission.version += 1
        owner.identity_status = submission.status
        owner.identity_mode = "SIMULATED"
        if body.decision == "CONFIRM" and not owner.subject_ref:
            owner.subject_ref = f"DEMO-USER-{owner.id}"
        audit(db, user, submission, "IDENTITY_REVIEWED", previous, submission.status, body.reason, [owner.id])
        return identity_dto(submission)

    return command(request, db, user, body.model_dump(), run)


@router.post("/reviews/listings/{id}/decision")
def listing_decision(
    id: UUID,
    body: ListingDecision,
    request: Request,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    require_assigned(get_or_404(db, Listing, str(id)), user)

    def run():
        initial = get_or_404(db, Listing, str(id))
        require_assigned(initial, user)
        parcel = lock_parcel(db, initial.parcel_id)
        listing = locked(db, Listing, initial.id)
        require_assigned(listing, user)
        check_version(listing, body.expected_version)
        if listing.status != "UNDER_REVIEW" or parcel.status != "OPEN" or parcel.active_transaction_id:
            raise ApiError(409, "INVALID_TRANSITION", "Listing is not currently reviewable.")
        for document_id in body.evidence_document_ids:
            doc = get_or_404(db, Document, str(document_id))
            authorized_document(db, doc, user)
            if doc.owner_kind != "LISTING" or doc.owner_id != listing.id:
                raise ApiError(422, "VALIDATION_ERROR", "Decision evidence must belong to this listing.")
        previous = listing.status
        if body.decision == "APPROVE":
            seller = locked(db, User, listing.seller_id)
            if (
                seller.disabled
                or seller.identity_status != "CONFIRMED"
                or seller.identity_mode != "SIMULATED"
                or not seller.subject_ref
                or parcel.owner_id != seller.id
            ):
                raise ApiError(
                    409,
                    "IDENTITY_NOT_CONFIRMED",
                    "Supported seller identity and configured ownership are required.",
                )
            job = current_completed_job(db, listing.id)
            docs = db.scalars(
                select(Document).where(Document.owner_kind == "LISTING", Document.owner_id == listing.id)
            ).all()
            if not set(REQUIRED_TYPES).issubset({doc.document_type for doc in docs}) or job is None:
                raise ApiError(
                    409,
                    "REVIEW_NOT_CURRENT",
                    "A current completed document review under the selected extraction policy is required.",
                )
            if len(job.findings or []) < len(REQUIRED_TYPES) * 3 or any(
                finding["status"] != "MATCHES_SOURCE" for finding in job.findings
            ):
                raise ApiError(
                    409,
                    "REVIEW_NOT_CURRENT",
                    "Blocking discrepancies, missing evidence or uncertain extraction require changes; automatic findings cannot be overridden.",
                )
            listing.status = "APPROVED"
            listing.approved_document_set_hash = document_set_hash(db, listing.id)
            listing.reviewed_at = utcnow()
        else:
            listing.status = "CHANGES_REQUIRED"
            listing.approved_document_set_hash = None
            listing.reviewed_at = None
        listing.version += 1
        audit(
            db, user, listing, "LISTING_REVIEWED", previous, listing.status, body.reason, [listing.seller_id]
        )
        return listing_dto(db, listing, user, True)

    return command(request, db, user, body.model_dump(mode="json"), run)
