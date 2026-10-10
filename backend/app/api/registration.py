"""Signed simulator events use exactly the same processor as integration deliveries."""

import hashlib
import hmac
import json
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError, success
from app.core.security import current_user
from app.db import get_db
from app.models import HoldCase, Listing, Parcel, RegistrationEvent, Transaction, User, new_id, utcnow
from app.services.common import (
    assigned_user,
    audit,
    check_version,
    command,
    get_or_404,
    lock_parcel,
    transaction_dto,
)

router = APIRouter(tags=["registration"])


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: UUID
    provider: Literal["DEMO_REGISTRY"]
    mode: Literal["SIMULATED"]
    event_type: Literal["REGISTRATION_COMPLETED"]
    provider_parcel_ref: str = Field(min_length=1, max_length=160)
    authority_revision: int = Field(ge=1)
    registration_reference: str = Field(min_length=1, max_length=160)
    seller_subject_ref: str = Field(min_length=1, max_length=160)
    buyer_subject_ref: str = Field(min_length=1, max_length=160)
    whole_parcel: bool
    registered_at: datetime
    evidence_reference: str = Field(min_length=1, max_length=160)


class Simulate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    transaction_id: UUID
    expected_version: int = Field(ge=1, strict=True)
    registration_reference: str = Field(min_length=1, max_length=160)


def authenticate(raw, event_id, timestamp, signature):
    try:
        when = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        if when.tzinfo is None or abs((utcnow() - when).total_seconds()) > 300:
            raise ValueError
        UUID(event_id)
    except (ValueError, TypeError, AttributeError):
        raise ApiError(403, "FORBIDDEN", "Invalid event authentication.") from None
    expected = hmac.new(
        settings.simulator_secret.encode(), timestamp.encode() + b"." + raw, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature or "", expected):
        raise ApiError(403, "FORBIDDEN", "Invalid event signature.")


def process_event(db, payload, raw, actor=None):
    event_id = str(payload.event_id)
    # Durable uniqueness and transaction-scoped lock serialize duplicate delivery.
    from sqlalchemy import text

    key = int.from_bytes(
        hashlib.sha256(f"event:{payload.provider}:{event_id}".encode()).digest()[:8], "big", signed=True
    )
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
    digest = hashlib.sha256(raw).hexdigest()
    existing = db.scalar(
        select(RegistrationEvent).where(
            RegistrationEvent.provider == payload.provider, RegistrationEvent.event_id == event_id
        )
    )
    if existing:
        if existing.payload_hash != digest:
            raise ApiError(409, "IDEMPOTENCY_CONFLICT", "Event ID reused with different content.")
        return "ALREADY_PROCESSED"
    event = RegistrationEvent(
        provider=payload.provider,
        event_id=event_id,
        payload_hash=digest,
        payload=payload.model_dump(mode="json"),
        processing_result="QUARANTINED",
    )
    db.add(event)
    parcel = db.scalar(select(Parcel).where(Parcel.provider_parcel_ref == payload.provider_parcel_ref))
    if not parcel:
        # Unknown mapping degrades the entire synthetic provider, never guess a parcel.
        for candidate in db.scalars(select(Parcel).order_by(Parcel.id)).all():
            candidate = lock_parcel(db, candidate.id)
            candidate.official_available = False
            candidate.version += 1
        return "QUARANTINED"
    parcel = lock_parcel(db, parcel.id)
    tx = db.scalar(
        select(Transaction)
        .where(Transaction.parcel_id == parcel.id, Transaction.closed_at.is_(None))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    listing = db.scalar(
        select(Listing).where(Listing.parcel_id == parcel.id, Listing.status.notin_(["WITHDRAWN", "CLOSED"]))
    )
    seller = db.scalar(select(User).where(User.subject_ref == payload.seller_subject_ref))
    buyer = db.scalar(select(User).where(User.subject_ref == payload.buyer_subject_ref))
    if payload.authority_revision < parcel.authority_revision:
        event.processing_result = "ALREADY_PROCESSED"
        return event.processing_result
    if payload.authority_revision == parcel.authority_revision:
        # Only the exact logical duplicate handled above is safe at the same revision.
        parcel.official_available = False
        quarantine(db, parcel, tx, actor, "CONFLICTING_REVISION")
        return "QUARANTINED"
    if (
        not payload.whole_parcel
        or seller is None
        or buyer is None
        or seller.id != parcel.owner_id
        or payload.authority_revision != parcel.authority_revision + 1
    ):
        parcel.official_available = False
        quarantine(db, parcel, tx, actor, "PARTIAL_UNMAPPED_OR_REVISION_GAP")
        return "QUARANTINED"
    previous = parcel.status
    parcel.status = "TRANSFERRED"
    parcel.official_status = "TRANSFER_RECORDED"
    parcel.owner_id = buyer.id
    parcel.authority_revision = payload.authority_revision
    parcel.version += 1
    if listing:
        listing.status = "CLOSED"
        listing.version += 1
    if tx and tx.seller_id == seller.id and tx.buyer_id == buyer.id:
        old = tx.status
        tx.status = "COMPLETED"
        tx.closed_at = utcnow()
        tx.version += 1
        tx.registration_reference = payload.registration_reference
        tx.application_status = "COMPLETED"
        parcel.active_transaction_id = None
        audit(
            db,
            actor,
            tx,
            "REGISTRATION_COMPLETED",
            old,
            "COMPLETED",
            "Authenticated simulated whole-parcel event.",
            [tx.seller_id, tx.buyer_id],
        )
    elif tx:
        quarantine(db, parcel, tx, actor, "EXTERNAL_BUYER_TRANSFER")
    audit(
        db, actor, parcel, "OFFICIAL_TRANSFER_RECORDED", previous, "TRANSFERRED", payload.evidence_reference
    )
    event.processing_result = "APPLIED"
    return "APPLIED"


def quarantine(db, parcel, tx, actor, reason):
    if tx:
        old = tx.status
        if tx.status != "HOLD":
            tx.resume_state = tx.resume_state or tx.status
            tx.status = "HOLD"
        tx.version += 1
        if tx.hold_case_id:
            hold = db.get(HoldCase, tx.hold_case_id)
            if hold and hold.status in ["OPEN", "UNDER_REVIEW"]:
                return
    from datetime import timedelta

    hold = HoldCase(
        parcel_id=parcel.id,
        transaction_id=tx.id if tx else None,
        reason_code=reason,
        summary="Simulated official evidence requires review.",
        response_due_at=utcnow() + timedelta(hours=settings.evidence_response_hours),
        assigned_reviewer_id=assigned_user(db, "REVIEWER"),
    )
    db.add(hold)
    db.flush()
    if tx:
        tx.hold_case_id = hold.id
        audit(db, actor, tx, "OFFICIAL_EVENT_HOLD", old, "HOLD", reason, [tx.seller_id, tx.buyer_id])
    if parcel.status != "TRANSFERRED":
        parcel.status = "HOLD"
    parcel.version += 1


@router.post("/registrations/simulate")
def simulate(body: Simulate, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    def run():
        if settings.official_integration_mode != "SIMULATED":
            raise ApiError(403, "FORBIDDEN", "Simulator disabled.")
        tx = get_or_404(db, Transaction, str(body.transaction_id))
        if "REGISTRAR" not in user.roles or tx.assigned_registrar_id != user.id:
            raise ApiError(403, "FORBIDDEN", "Only the assigned demo registrar can simulate completion.")
        parcel = lock_parcel(db, tx.parcel_id)
        db.refresh(tx)
        check_version(tx, body.expected_version)
        if tx.status != "REGISTRATION_PENDING" or tx.application_status not in ["SUBMITTED", "PENDING"]:
            raise ApiError(409, "INVALID_TRANSITION", "No eligible pending application.")
        if set(tx.confirmed_by or []) != {tx.seller_id, tx.buyer_id}:
            raise ApiError(
                409, "DEED_CONFIRMATIONS_REQUIRED", "Both current deed confirmations are required."
            )
        seller, buyer = db.get(User, tx.seller_id), db.get(User, tx.buyer_id)
        payload = Event(
            event_id=new_id(),
            provider="DEMO_REGISTRY",
            mode="SIMULATED",
            event_type="REGISTRATION_COMPLETED",
            provider_parcel_ref=parcel.provider_parcel_ref,
            authority_revision=parcel.authority_revision + 1,
            registration_reference=body.registration_reference,
            seller_subject_ref=seller.subject_ref,
            buyer_subject_ref=buyer.subject_ref,
            whole_parcel=True,
            registered_at=utcnow(),
            evidence_reference="SYNTHETIC-REGISTERED-DEED",
        )
        raw = json.dumps(payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode()
        timestamp = utcnow().isoformat()
        signature = hmac.new(
            settings.simulator_secret.encode(), timestamp.encode() + b"." + raw, hashlib.sha256
        ).hexdigest()
        authenticate(raw, str(payload.event_id), timestamp, signature)
        result = process_event(db, payload, raw, user)
        return {"processing_result": result, "transaction": transaction_dto(db, tx, user)}

    return command(request, db, user, body.model_dump(mode="json"), run)


@router.post("/integrations/registration/events")
async def integration_event(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()
    if len(raw) > 65536:
        raise ApiError(413, "FILE_REJECTED", "Event body exceeds limit.")
    authenticate(
        raw,
        request.headers.get("X-Event-ID"),
        request.headers.get("X-Event-Timestamp"),
        request.headers.get("X-Event-Signature"),
    )
    try:
        payload = Event.model_validate_json(raw)
    except ValueError:
        raise ApiError(422, "VALIDATION_ERROR", "Invalid registration event.") from None
    if str(payload.event_id) != request.headers.get("X-Event-ID"):
        raise ApiError(403, "FORBIDDEN", "Event ID mismatch.")
    try:
        result = process_event(db, payload, raw)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return success(request, {"processing_result": result})
