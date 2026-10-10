"""Whole-parcel workflow commands; callers own commits and idempotency.

Every write locks parcel -> transaction -> invitation/case, uses authenticated
relationships, and retains closed records. No command claims to transfer title.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError
from app.domain import decimal_string, iso_utc
from app.models import (
    Audit,
    CancellationCase,
    Document,
    HoldCase,
    Invitation,
    Listing,
    OfficialCheck,
    Parcel,
    Transaction,
    User,
)
from app.services.common import (
    assigned_user,
    audit,
    availability,
    cancellation_dto,
    check_identity,
    check_version,
    document_dto,
    get_or_404,
    hold_dto,
    invitation_dto,
    listing_dto,
    lock_parcel,
    official_check,
    page,
    transaction_dto,
)
from app.services.documents import authorized_document, store_document, synthetic_pdf

TERMINAL = {"CLOSED_CANCELLED", "COMPLETED"}
OPEN_HOLDS = {"OPEN", "UNDER_REVIEW"}
CLOSED_CANCELLATIONS = {"CLOSED_RELEASED", "CLOSED_NO_RELEASE"}


def now() -> datetime:
    return datetime.now(UTC)


def fail(code: str, message: str, status: int = 409) -> None:
    raise ApiError(status, code, message, retryable=status == 503)


def party(tx: Transaction, user: User) -> None:
    if user.id not in {tx.seller_id, tx.buyer_id}:
        fail("NOT_FOUND", "Transaction not found.", 404)


def assigned(case, user: User) -> None:
    if "REVIEWER" not in user.roles or case.assigned_reviewer_id != user.id:
        fail("NOT_FOUND", "Assigned review not found.", 404)


def transaction_access(db: Session, tx: Transaction, user: User) -> None:
    if user.id in {tx.seller_id, tx.buyer_id}:
        return
    if "REGISTRAR" in user.roles and tx.assigned_registrar_id == user.id:
        return
    if "REVIEWER" in user.roles:
        for model, case_id in ((CancellationCase, tx.cancellation_case_id), (HoldCase, tx.hold_case_id)):
            case = db.get(model, case_id) if case_id else None
            if case is not None and case.assigned_reviewer_id == user.id:
                return
        listing = db.get(Listing, tx.listing_id)
        if listing is not None and listing.assigned_reviewer_id == user.id:
            return
    fail("NOT_FOUND", "Transaction not found.", 404)


def invitation_access(db: Session, inv: Invitation, user: User, action: str) -> Listing:
    listing = get_or_404(db, Listing, inv.listing_id)
    expected_actor = inv.buyer_id if action == "withdraw" else listing.seller_id
    if expected_actor != user.id:
        fail("NOT_FOUND", "Invitation not found.", 404)
    return listing


def cancellation_access(db: Session, case: CancellationCase, user: User, reviewer=False) -> Transaction:
    tx = get_or_404(db, Transaction, case.transaction_id)
    if reviewer or user.id not in {tx.seller_id, tx.buyer_id}:
        assigned(case, user)
    return tx


def hold_access(db: Session, case: HoldCase, user: User, reviewer=False) -> Transaction | None:
    tx = get_or_404(db, Transaction, case.transaction_id) if case.transaction_id else None
    if reviewer:
        assigned(case, user)
    elif tx and user.id in {tx.seller_id, tx.buyer_id}:
        pass
    elif not tx and get_or_404(db, Parcel, case.parcel_id).owner_id == user.id:
        pass
    else:
        assigned(case, user)
    return tx


def locked(db: Session, model, resource_id: str):
    obj = db.scalar(
        select(model)
        .where(model.id == resource_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if obj is None:
        fail("NOT_FOUND", "Resource not found.", 404)
    return obj


def lock_transaction(db: Session, tx_id: str) -> tuple[Parcel, Transaction]:
    initial = get_or_404(db, Transaction, tx_id)
    parcel = lock_parcel(db, initial.parcel_id)
    return parcel, locked(db, Transaction, tx_id)


def active(parcel: Parcel, tx: Transaction) -> None:
    if tx.closed_at is not None or tx.status in TERMINAL or parcel.active_transaction_id != tx.id:
        fail("INVALID_TRANSITION", "This transaction is no longer active.")


def stage(parcel: Parcel, tx: Transaction, expected: str) -> None:
    active(parcel, tx)
    if tx.status != expected or parcel.status != "LOCKED":
        fail("INVALID_TRANSITION", "This action is not available at the current stage.")


def evidence(db: Session, user: User, tx: Transaction | None, parcel: Parcel, ids: list[str]) -> list[str]:
    """Linking evidence never grants access to an unrelated document."""
    result = list(dict.fromkeys(str(value) for value in ids))
    for document_id in result:
        doc = get_or_404(db, Document, document_id)
        authorized_document(db, doc, user)
        related = (
            (doc.owner_kind == "USER" and doc.owner_id == user.id)
            or (tx is not None and doc.owner_kind == "TRANSACTION" and doc.owner_id == tx.id)
            or (
                doc.owner_kind == "LISTING"
                and (listing := db.get(Listing, doc.owner_id)) is not None
                and listing.parcel_id == parcel.id
                and (tx is None or listing.id == tx.listing_id)
            )
        )
        if not related or doc.document_type in {"IDENTITY", "LAND_PHOTO"}:
            fail("FORBIDDEN", "Evidence must belong to this case or its participating party.", 403)
        if tx and doc.sharing_scope != "TRANSACTION_PARTIES_AND_OFFICERS":
            fail(
                "FORBIDDEN", "Share case evidence with transaction parties and assigned officers first.", 403
            )
    return result


def record(db: Session, user: User, tx: Transaction, action: str, previous: str, reason=None):
    audit(db, user, tx, action, previous, tx.status, reason=reason, recipients=[tx.seller_id, tx.buyer_id])


def tx_case_data(db: Session, tx: Transaction, user: User, case: CancellationCase) -> dict:
    db.flush()
    return {"transaction": transaction_dto(db, tx, user), "cancellation_case": cancellation_dto(case)}


def ensure_hold(
    db: Session,
    parcel: Parcel,
    tx: Transaction,
    reason: str,
    summary: str,
    document_ids: list[str] | None = None,
) -> HoldCase:
    """Additional evidence must not overwrite the stage saved by the first hold."""
    case = locked(db, HoldCase, tx.hold_case_id) if tx.hold_case_id else None
    if case is None or case.status not in OPEN_HOLDS:
        case = HoldCase(
            id=str(uuid4()),
            parcel_id=parcel.id,
            transaction_id=tx.id,
            version=1,
            status="OPEN",
            reason_code=reason,
            summary=summary,
            evidence_document_ids=list(document_ids or []),
            assigned_reviewer_id=assigned_user(db, "REVIEWER"),
            response_due_at=now() + timedelta(hours=settings.evidence_response_hours),
        )
        db.add(case)
        db.flush()
        tx.hold_case_id = case.id
    else:
        case.evidence_document_ids = list(
            dict.fromkeys([*(case.evidence_document_ids or []), *(document_ids or [])])
        )
        case.version += 1
    if tx.status != "HOLD":
        tx.resume_state = tx.status
        tx.status = "HOLD"
    if parcel.status != "TRANSFERRED":
        parcel.status = "HOLD"
    return case


def create_invitation(db: Session, user: User, listing_id: str, payload: dict) -> dict:
    initial = get_or_404(db, Listing, listing_id)
    if initial.status not in {"PUBLISHED", "CLOSED"}:
        fail("NOT_FOUND", "Listing is not publicly visible.", 404)
    parcel = lock_parcel(db, initial.parcel_id)
    listing = locked(db, Listing, listing_id)
    check_identity(user)
    if listing.seller_id == user.id:
        fail("FORBIDDEN", "You cannot send an invitation for your own land.", 403)
    if availability(db, listing) != "AVAILABLE" or parcel.active_transaction_id is not None:
        fail("PARCEL_NOT_AVAILABLE", "This land is not available for invitations.")
    if db.scalar(
        select(Invitation).where(
            Invitation.listing_id == listing.id,
            Invitation.buyer_id == user.id,
            Invitation.status == "PENDING",
        )
    ):
        fail("INVALID_TRANSITION", "You already have a pending invitation for this listing.")
    inv = Invitation(
        id=str(uuid4()),
        listing_id=listing.id,
        buyer_id=user.id,
        status="PENDING",
        version=1,
        message=payload["message"],
    )
    db.add(inv)
    db.flush()
    audit(db, user, inv, "INVITATION_CREATED", None, inv.status, recipients=[listing.seller_id])
    return invitation_dto(db, inv, user)


def accept_invitation(db: Session, user: User, inv_id: str, payload: dict) -> dict:
    initial = get_or_404(db, Invitation, inv_id)
    initial_listing = invitation_access(db, initial, user, "accept")
    parcel = lock_parcel(db, initial_listing.parcel_id)
    listing = locked(db, Listing, initial_listing.id)
    existing = db.scalar(
        select(Transaction)
        .where(Transaction.parcel_id == parcel.id, Transaction.closed_at.is_(None))
        .with_for_update()
    )
    inv = locked(db, Invitation, inv_id)
    invitation_access(db, inv, user, "accept")
    check_version(parcel, payload["expected_version"])
    check_version(inv, payload["expected_invitation_version"])
    if existing or parcel.active_transaction_id or parcel.status != "OPEN":
        fail("PARCEL_NOT_AVAILABLE", "This land has an active transaction or hold.")
    if inv.status != "PENDING":
        fail("INVALID_TRANSITION", "Only a pending invitation can be accepted.")
    if inv.buyer_id == listing.seller_id or parcel.owner_id != listing.seller_id:
        fail("FORBIDDEN", "The listing seller is not eligible to accept this invitation.", 403)
    buyer = db.scalar(select(User).where(User.id == inv.buyer_id).execution_options(populate_existing=True))
    seller = db.scalar(
        select(User).where(User.id == listing.seller_id).execution_options(populate_existing=True)
    )
    if buyer is None or seller is None:
        fail("IDENTITY_NOT_CONFIRMED", "Both parties require current confirmed identities.")
    check_identity(buyer)
    check_identity(seller)
    if db.scalar(select(HoldCase.id).where(HoldCase.parcel_id == parcel.id, HoldCase.status.in_(OPEN_HOLDS))):
        fail("PARCEL_NOT_AVAILABLE", "This land has an unresolved hold.")
    check = official_check(db, parcel)
    if check.status != "CURRENT" or not parcel.official_available:
        fail("OFFICIAL_STATUS_UNKNOWN", "Official records do not confirm this parcel is available.")
    if availability(db, listing) != "AVAILABLE":
        fail("REVIEW_NOT_CURRENT", "This listing must have a current approved, published review.")
    tx = Transaction(
        id=str(uuid4()),
        parcel_id=parcel.id,
        listing_id=listing.id,
        seller_id=listing.seller_id,
        buyer_id=inv.buyer_id,
        accepted_invitation_id=inv.id,
        status="DISCUSSION",
        version=1,
        commitments={"reported": False, "summary": None},
        outcomes={},
        confirmed_by=[],
    )
    db.add(tx)
    db.flush()
    parcel.status = "LOCKED"
    parcel.active_transaction_id = tx.id
    parcel.version += 1
    inv.status = "ACCEPTED"
    inv.version += 1
    record(db, user, tx, "INVITATION_ACCEPTED", "OPEN")
    db.flush()
    return {
        "transaction": transaction_dto(db, tx, user),
        "listing": listing_dto(db, listing, user, private=True),
        "invitation": invitation_dto(db, inv, user),
    }


def invitation_decision(db: Session, user: User, inv_id: str, payload: dict, action: str) -> dict:
    initial = get_or_404(db, Invitation, inv_id)
    listing = invitation_access(db, initial, user, action)
    lock_parcel(db, listing.parcel_id)
    inv = locked(db, Invitation, inv_id)
    invitation_access(db, inv, user, action)
    check_version(inv, payload["expected_version"])
    if inv.status != "PENDING":
        fail("INVALID_TRANSITION", "Only pending invitations can be declined or withdrawn.")
    inv.status = "DECLINED" if action == "decline" else "WITHDRAWN"
    inv.version += 1
    audit(
        db,
        user,
        inv,
        f"INVITATION_{inv.status}",
        "PENDING",
        inv.status,
        recipients=[inv.buyer_id if action == "decline" else listing.seller_id],
    )
    db.flush()
    return invitation_dto(db, inv, user)


def open_cancellation(
    db: Session, user: User, parcel: Parcel, tx: Transaction, payload: dict, document_ids: list[str]
) -> CancellationCase:
    if tx.cancellation_case_id:
        prior = locked(db, CancellationCase, tx.cancellation_case_id)
        if prior.status not in CLOSED_CANCELLATIONS:
            fail("INVALID_TRANSITION", "This transaction already has an open cancellation case.")
    previous = tx.status
    if tx.status == "HOLD":
        fail("INVALID_TRANSITION", "The assigned hold reviewer must route this case to cancellation.")
    requested_stage = tx.resume_state if tx.status == "HOLD" else tx.status
    if requested_stage not in {"DISCUSSION", "AGREEMENT_PREPARATION", "REGISTRATION_PENDING"}:
        fail("INVALID_TRANSITION", "Cancellation is not available at this stage.")
    claimed = payload.get("claimed_commitments", False)
    case = CancellationCase(
        id=str(uuid4()),
        transaction_id=tx.id,
        version=1,
        status="REQUESTED",
        requested_by=user.id,
        reason=payload["reason"],
        stage_at_request=requested_stage,
        claimed_commitments=claimed,
        evidence_document_ids=document_ids,
        responses=[],
        response_due_at=now() + timedelta(hours=settings.discussion_response_hours),
        assigned_reviewer_id=assigned_user(db, "REVIEWER"),
    )
    db.add(case)
    db.flush()
    tx.cancellation_case_id = case.id
    if claimed:
        tx.commitments = {"reported": True, "summary": payload["reason"]}
    if tx.status == "HOLD":
        tx.resume_state = "CANCELLATION_PENDING"
        case.status = "HOLD"
    else:
        tx.status = "CANCELLATION_PENDING"
        tx.resume_state = None
    if claimed or (tx.commitments or {}).get("reported"):
        ensure_hold(db, parcel, tx, "COMMITMENT_UNRESOLVED", payload["reason"], document_ids)
        case.status = "HOLD"
    tx.version += 1
    parcel.version += 1
    record(db, user, tx, "CANCELLATION_REQUESTED", previous, payload["reason"])
    return case


def request_cancellation(db: Session, user: User, tx_id: str, payload: dict) -> dict:
    parcel, tx = lock_transaction(db, tx_id)
    party(tx, user)
    active(parcel, tx)
    check_version(tx, payload["expected_version"])
    docs = evidence(db, user, tx, parcel, payload["evidence_document_ids"])
    case = open_cancellation(db, user, parcel, tx, payload, docs)
    return tx_case_data(db, tx, user, case)


def record_outcome(db: Session, user: User, tx_id: str, payload: dict) -> dict:
    parcel, tx = lock_transaction(db, tx_id)
    party(tx, user)
    stage(parcel, tx, "DISCUSSION")
    check_version(tx, payload["expected_version"])
    docs = evidence(db, user, tx, parcel, payload["evidence_document_ids"])
    choice = payload["choice"]
    response = {
        "user_id": user.id,
        "choice": choice,
        "reason": payload["reason"],
        "claimed_commitments": payload["claimed_commitments"],
        "evidence_document_ids": docs,
        "recorded_at": iso_utc(now()),
        "stage": tx.status,
    }
    tx.outcomes = {
        **(tx.outcomes or {}),
        user.id: response,
        "_history": [*((tx.outcomes or {}).get("_history", [])), response],
    }
    if choice == "CANCEL":
        case = open_cancellation(db, user, parcel, tx, payload, docs)
        return tx_case_data(db, tx, user, case)
    previous = tx.status
    if payload["claimed_commitments"] or (tx.commitments or {}).get("reported"):
        tx.commitments = {
            "reported": True,
            "summary": payload["reason"] or "Reported commitments need review.",
        }
        ensure_hold(db, parcel, tx, "COMMITMENT_UNRESOLVED", tx.commitments["summary"], docs)
        parcel.version += 1
    elif all(
        (tx.outcomes.get(actor) or {}).get("choice") == "PROCEED" for actor in (tx.seller_id, tx.buyer_id)
    ):
        tx.status = "AGREEMENT_PREPARATION"
    tx.version += 1
    record(db, user, tx, "OUTCOME_RECORDED", previous, payload["reason"])
    db.flush()
    return {"transaction": transaction_dto(db, tx, user), "cancellation_case": None}


def set_terms(db: Session, user: User, tx_id: str, payload: dict) -> dict:
    parcel, tx = lock_transaction(db, tx_id)
    party(tx, user)
    stage(parcel, tx, "AGREEMENT_PREPARATION")
    check_version(tx, payload["expected_version"])
    tx.terms = {
        "agreed_price_inr": decimal_string(payload["agreed_price_inr"]),
        "payment_terms_text": payload["payment_terms_text"],
        "possession_terms_text": payload["possession_terms_text"],
        "version": (tx.terms or {}).get("version", 0) + 1,
    }
    tx.draft_document_id = None
    tx.draft_hash = None
    tx.confirmed_by = []
    tx.version += 1
    record(db, user, tx, "TERMS_SET", tx.status)
    db.flush()
    return transaction_dto(db, tx, user)


def generate_deed(db: Session, user: User, tx_id: str, payload: dict) -> dict:
    parcel, tx = lock_transaction(db, tx_id)
    party(tx, user)
    stage(parcel, tx, "AGREEMENT_PREPARATION")
    check_version(tx, payload["expected_version"])
    if not tx.terms or not tx.terms.get("agreed_price_inr"):
        fail("INVALID_TRANSITION", "Set the current terms before generating a draft.")
    text = (
        "DEMONSTRATION ONLY - SYNTHETIC KARNATAKA WHOLE-PARCEL DRAFT\n"
        "SIMULATED GOVERNMENT RECORDS. NOT A LEGAL DEED OR REVIEWED LEGAL TEMPLATE.\n"
        "This document does not transfer title, verify payment or establish legal obligations.\n"
        f"Transaction: {tx.id}\nSeller demo ID: {tx.seller_id}\nBuyer demo ID: {tx.buyer_id}\n"
        f"Parcel: {parcel.id}\nLocation: {parcel.location}\nWhole parcel area sqm: {parcel.area_sqm}\n"
        f"Terms version: {tx.terms['version']}\nPrice INR: {tx.terms['agreed_price_inr']}\n"
        f"Payment terms (unverified claims): {tx.terms['payment_terms_text']}\n"
        f"Possession terms: {tx.terms['possession_terms_text']}\nGenerated UTC: {iso_utc(now())}"
    )
    doc = store_document(
        db,
        user,
        "TRANSACTION",
        tx.id,
        "DRAFT_DEED",
        f"synthetic-draft-{tx.id}.pdf",
        synthetic_pdf(text),
        "TRANSACTION_PARTIES_AND_OFFICERS",
    )
    db.flush()
    tx.draft_document_id = doc.id
    tx.draft_hash = doc.sha256
    tx.confirmed_by = []
    tx.version += 1
    record(db, user, tx, "SYNTHETIC_DEED_GENERATED", tx.status)
    db.flush()
    return {"transaction": transaction_dto(db, tx, user), "document": document_dto(doc)}


def confirm_deed(db: Session, user: User, tx_id: str, payload: dict) -> dict:
    parcel, tx = lock_transaction(db, tx_id)
    party(tx, user)
    stage(parcel, tx, "AGREEMENT_PREPARATION")
    check_version(tx, payload["expected_version"])
    if not tx.draft_document_id or not tx.draft_hash or tx.draft_hash != payload["draft_hash"]:
        fail("VERSION_CONFLICT", "Confirm the exact current draft hash.")
    tx.confirmed_by = list(dict.fromkeys([*(tx.confirmed_by or []), user.id]))
    tx.version += 1
    record(db, user, tx, "DEED_CONFIRMED", tx.status)
    db.flush()
    return transaction_dto(db, tx, user)


def submit_registration(db: Session, user: User, tx_id: str, payload: dict) -> dict:
    parcel, tx = lock_transaction(db, tx_id)
    party(tx, user)
    stage(parcel, tx, "AGREEMENT_PREPARATION")
    check_version(tx, payload["expected_version"])
    if not tx.draft_hash or payload["draft_hash"] != tx.draft_hash:
        fail("VERSION_CONFLICT", "Submit the exact current draft hash.")
    if not tx.draft_document_id or set(tx.confirmed_by or []) != {tx.seller_id, tx.buyer_id}:
        fail("DEED_CONFIRMATIONS_REQUIRED", "Both parties must confirm the current draft.")
    if (tx.commitments or {}).get("reported"):
        fail("COMMITMENT_UNRESOLVED", "Reported commitments require review before submission.")
    tx.assigned_registrar_id = assigned_user(db, "REGISTRAR")
    tx.application_status = "SUBMITTED"
    tx.registration_reference = f"DEMO-APP-{tx.id}"
    tx.status = "REGISTRATION_PENDING"
    tx.version += 1
    parcel.version += 1
    record(db, user, tx, "REGISTRATION_SUBMITTED", "AGREEMENT_PREPARATION")
    db.flush()
    return transaction_dto(db, tx, user)


def respond_cancellation(db: Session, user: User, case_id: str, payload: dict) -> dict:
    initial = get_or_404(db, CancellationCase, case_id)
    parcel, tx = lock_transaction(db, initial.transaction_id)
    case = locked(db, CancellationCase, case_id)
    party(tx, user)
    active(parcel, tx)
    check_version(tx, payload["expected_version"])
    if case.requested_by == user.id:
        fail("FORBIDDEN", "Only the other party may respond to a cancellation request.", 403)
    if case.status in CLOSED_CANCELLATIONS or tx.cancellation_case_id != case.id:
        fail("INVALID_TRANSITION", "This cancellation case is already closed.")
    docs = evidence(db, user, tx, parcel, payload["evidence_document_ids"])
    previous = tx.status
    response = {
        "user_id": user.id,
        "decision": payload["decision"],
        "reason": payload["reason"],
        "claimed_commitments": payload["claimed_commitments"],
        "evidence_document_ids": docs,
        "responded_at": iso_utc(now()),
    }
    case.responses = [*(case.responses or []), response]
    if payload["claimed_commitments"]:
        tx.commitments = {"reported": True, "summary": payload["reason"]}
    if payload["decision"] == "DISAGREE" or payload["claimed_commitments"]:
        case.status = "HOLD"
        ensure_hold(db, parcel, tx, "CANCELLATION_DISPUTE", payload["reason"], docs)
    elif tx.status != "HOLD":
        case.status = "UNDER_REVIEW"
    case.version += 1
    tx.version += 1
    parcel.version += 1
    record(db, user, tx, "CANCELLATION_RESPONSE_RECORDED", previous, payload["reason"])
    return tx_case_data(db, tx, user, case)


def review_cancellation(db: Session, user: User, case_id: str, payload: dict) -> dict:
    initial = get_or_404(db, CancellationCase, case_id)
    parcel, tx = lock_transaction(db, initial.transaction_id)
    case = locked(db, CancellationCase, case_id)
    assigned(case, user)
    active(parcel, tx)
    check_version(case, payload["expected_version"])
    check_version(tx, payload["expected_transaction_version"])
    if case.status in CLOSED_CANCELLATIONS or tx.cancellation_case_id != case.id:
        fail("INVALID_TRANSITION", "This cancellation case is already closed.")
    docs = evidence(db, user, tx, parcel, payload["evidence_document_ids"])
    previous = tx.status
    if payload["decision"] == "REQUIRE_REVIEW":
        case.status = "HOLD"
        case.resolution_reason = payload["reason"]
        case.evidence_document_ids = list(dict.fromkeys([*(case.evidence_document_ids or []), *docs]))
        ensure_hold(db, parcel, tx, "CANCELLATION_REVIEW", payload["reason"], docs)
        tx.resume_state = "CANCELLATION_PENDING"
    else:
        if tx.status != "CANCELLATION_PENDING" or parcel.status != "LOCKED":
            fail("COMMITMENT_UNRESOLVED", "Resolve the current hold before releasing this reservation.")
        if case.claimed_commitments or (tx.commitments or {}).get("reported"):
            fail("COMMITMENT_UNRESOLVED", "Reported commitments have not been resolved.")
        if tx.confirmed_by:
            fail(
                "COMMITMENT_UNRESOLVED",
                "A confirmed agreement requires further authorized obligation review.",
            )
        other_id = tx.buyer_id if case.requested_by == tx.seller_id else tx.seller_id
        responses = [r for r in (case.responses or []) if r.get("user_id") == other_id]
        if not responses or responses[-1].get("decision") != "AGREE":
            fail("COMMITMENT_UNRESOLVED", "The other party must currently agree to early cancellation.")
        if any(r.get("claimed_commitments") for r in (case.responses or [])):
            fail("COMMITMENT_UNRESOLVED", "An outstanding commitment claim requires further review.")
        if tx.application_status not in {None, "REJECTED", "WITHDRAWN"}:
            fail(
                "COMMITMENT_UNRESOLVED", "Official application withdrawal or closure must first be verified."
            )
        if case.stage_at_request == "REGISTRATION_PENDING" and tx.application_status not in {
            "REJECTED",
            "WITHDRAWN",
        }:
            fail("COMMITMENT_UNRESOLVED", "An application cannot be released based on party consent alone.")
        if db.scalar(
            select(HoldCase.id).where(HoldCase.parcel_id == parcel.id, HoldCase.status.in_(OPEN_HOLDS))
        ):
            fail("COMMITMENT_UNRESOLVED", "This parcel has an unresolved review hold.")
        if parcel.owner_id != tx.seller_id or parcel.status == "TRANSFERRED":
            fail("PARCEL_NOT_AVAILABLE", "The old seller no longer has current parcel authority.")
        check = official_check(db, parcel)
        if check.status != "CURRENT" or not parcel.official_available:
            fail("OFFICIAL_STATUS_UNKNOWN", "A fresh official availability check is required.")
        case.official_check_id = check.id
        case.status = "CLOSED_RELEASED"
        case.resolution_reason = payload["reason"]
        case.resolved_at = now()
        case.evidence_document_ids = list(dict.fromkeys([*(case.evidence_document_ids or []), *docs]))
        tx.status = "CLOSED_CANCELLED"
        tx.closed_at = now()
        tx.resume_state = None
        parcel.active_transaction_id = None
        parcel.status = "OPEN"
        listing = locked(db, Listing, tx.listing_id)
        if listing.status == "PUBLISHED":
            listing.status = "APPROVED"
            listing.version += 1
            audit(
                db,
                user,
                listing,
                "EXPLICIT_REPUBLICATION_REQUIRED",
                "PUBLISHED",
                "APPROVED",
                reason=payload["reason"],
                recipients=[listing.seller_id],
            )
    case.version += 1
    tx.version += 1
    parcel.version += 1
    record(db, user, tx, "CANCELLATION_REVIEWED", previous, payload["reason"])
    result = tx_case_data(db, tx, user, case)
    result["parcel"] = {
        "id": parcel.id,
        "version": parcel.version,
        "status": parcel.status,
        "active_transaction_id": parcel.active_transaction_id,
    }
    return result


def submit_hold_evidence(db: Session, user: User, case_id: str, payload: dict) -> dict:
    initial = get_or_404(db, HoldCase, case_id)
    parcel = lock_parcel(db, initial.parcel_id)
    tx = locked(db, Transaction, initial.transaction_id) if initial.transaction_id else None
    case = locked(db, HoldCase, case_id)
    hold_access(db, case, user)
    if tx:
        party(tx, user)
        active(parcel, tx)
        if payload["expected_version"] is None:
            fail("VALIDATION_ERROR", "A transaction expected_version is required for this hold.", 422)
        check_version(tx, payload["expected_version"])
    elif parcel.owner_id != user.id:
        fail("FORBIDDEN", "Only the relevant party may submit evidence.", 403)
    elif payload["expected_version"] is not None:
        fail("VALIDATION_ERROR", "This hold has no transaction expected_version.", 422)
    check_version(case, payload["expected_case_version"])
    if case.status not in OPEN_HOLDS:
        fail("INVALID_TRANSITION", "This hold is resolved.")
    docs = evidence(db, user, tx, parcel, payload["evidence_document_ids"])
    case.evidence_document_ids = list(dict.fromkeys([*(case.evidence_document_ids or []), *docs]))
    case.version += 1
    if tx:
        tx.confirmed_by = []
        tx.version += 1
        record(db, user, tx, "HOLD_EVIDENCE_SUBMITTED", tx.status, payload["statement"])
    audit(
        db,
        user,
        case,
        "HOLD_EVIDENCE_SUBMITTED",
        case.status,
        case.status,
        reason=payload["statement"],
        recipients=[case.assigned_reviewer_id],
    )
    db.flush()
    return {"hold_case": hold_dto(case), "transaction": transaction_dto(db, tx, user) if tx else None}


def review_hold(db: Session, user: User, case_id: str, payload: dict) -> dict:
    initial = get_or_404(db, HoldCase, case_id)
    parcel = lock_parcel(db, initial.parcel_id)
    tx = locked(db, Transaction, initial.transaction_id) if initial.transaction_id else None
    case = locked(db, HoldCase, case_id)
    assigned(case, user)
    check_version(case, payload["expected_version"])
    if case.status not in OPEN_HOLDS:
        fail("INVALID_TRANSITION", "This hold is already resolved.")
    if tx:
        active(parcel, tx)
        if payload["expected_transaction_version"] is None:
            fail("VALIDATION_ERROR", "A transaction expected version is required.", 422)
        check_version(tx, payload["expected_transaction_version"])
        if tx.hold_case_id != case.id or tx.status != "HOLD":
            fail("INVALID_TRANSITION", "This is not the current transaction hold.")
    elif payload["expected_transaction_version"] is not None:
        fail("VALIDATION_ERROR", "This case has no transaction version.", 422)
    docs = evidence(db, user, tx, parcel, payload["evidence_document_ids"])
    case.evidence_document_ids = list(dict.fromkeys([*(case.evidence_document_ids or []), *docs]))
    previous = tx.status if tx else parcel.status
    decision = payload["decision"]
    if decision == "ESCALATE":
        case.status = "UNDER_REVIEW"
        case.response_due_at = now() + timedelta(hours=settings.evidence_response_hours)
    elif decision == "RESUME":
        if parcel.status == "TRANSFERRED" or parcel.official_status == "TRANSFER_RECORDED":
            fail("PARCEL_NOT_AVAILABLE", "A recorded external transfer cannot be reopened.")
        official_check(db, parcel)
        other_hold = db.scalar(
            select(HoldCase.id).where(
                HoldCase.parcel_id == parcel.id, HoldCase.id != case.id, HoldCase.status.in_(OPEN_HOLDS)
            )
        )
        if other_hold:
            fail("COMMITMENT_UNRESOLVED", "Another unresolved hold still affects this parcel.")
        if tx:
            if tx.resume_state not in {
                "DISCUSSION",
                "AGREEMENT_PREPARATION",
                "REGISTRATION_PENDING",
                "CANCELLATION_PENDING",
            }:
                fail("INVALID_TRANSITION", "The prior transaction stage is unavailable for resume.")
            tx.status = tx.resume_state
            tx.resume_state = None
            parcel.status = "LOCKED"
            if tx.cancellation_case_id:
                cancellation = locked(db, CancellationCase, tx.cancellation_case_id)
                if cancellation.status == "HOLD":
                    cancellation.status = "UNDER_REVIEW"
                    cancellation.version += 1
        else:
            if parcel.active_transaction_id:
                fail("PARCEL_NOT_AVAILABLE", "An active transaction still reserves this parcel.")
            parcel.status = "OPEN"
            for listing in db.scalars(
                select(Listing).where(Listing.parcel_id == parcel.id, Listing.status == "PUBLISHED")
            ):
                listing.status = "APPROVED"
                listing.version += 1
        case.status = "RESOLVED_CONTINUE"
        case.resolved_at = now()
    else:
        if not tx:
            fail("INVALID_TRANSITION", "A standalone hold has no transaction to cancel.")
        if parcel.status == "TRANSFERRED" or parcel.official_status == "TRANSFER_RECORDED":
            fail(
                "PARCEL_NOT_AVAILABLE",
                "A recorded transfer requires official resolution, not cancellation release.",
            )
        if not tx.cancellation_case_id:
            original_stage = tx.resume_state
            cancellation = CancellationCase(
                id=str(uuid4()),
                transaction_id=tx.id,
                version=1,
                status="UNDER_REVIEW",
                requested_by=tx.seller_id,
                reason=payload["reason"],
                stage_at_request=original_stage,
                claimed_commitments=(tx.commitments or {}).get("reported", False),
                evidence_document_ids=docs,
                responses=[],
                assigned_reviewer_id=user.id,
                response_due_at=now() + timedelta(hours=settings.discussion_response_hours),
            )
            if original_stage not in {
                "DISCUSSION",
                "AGREEMENT_PREPARATION",
                "REGISTRATION_PENDING",
                "CANCELLATION_PENDING",
            }:
                fail("INVALID_TRANSITION", "The prior stage cannot enter cancellation review.")
            db.add(cancellation)
            db.flush()
            tx.cancellation_case_id = cancellation.id
        else:
            cancellation = locked(db, CancellationCase, tx.cancellation_case_id)
            if cancellation.status in CLOSED_CANCELLATIONS:
                fail("INVALID_TRANSITION", "The prior cancellation is closed; further review is required.")
            cancellation.status = "UNDER_REVIEW"
            cancellation.version += 1
        tx.status = "CANCELLATION_PENDING"
        tx.resume_state = None
        parcel.status = "LOCKED"
        case.status = "RESOLVED_CANCELLATION"
        case.resolved_at = now()
    case.resolution_reason = payload["reason"]
    case.version += 1
    parcel.version += 1
    if tx:
        tx.version += 1
        record(db, user, tx, "HOLD_REVIEWED", previous, payload["reason"])
    audit(
        db,
        user,
        case,
        "HOLD_REVIEWED",
        "UNDER_REVIEW",
        case.status,
        reason=payload["reason"],
        recipients=[tx.seller_id, tx.buyer_id] if tx else [parcel.owner_id],
    )
    db.flush()
    return {"hold_case": hold_dto(case), "transaction": transaction_dto(db, tx, user) if tx else None}


def registrar_access(tx: Transaction, user: User) -> None:
    if "REGISTRAR" not in user.roles or tx.assigned_registrar_id != user.id:
        fail("NOT_FOUND", "Assigned registration not found.", 404)


def review_registration(db: Session, user: User, tx_id: str, payload: dict) -> dict:
    parcel, tx = lock_transaction(db, tx_id)
    registrar_access(tx, user)
    active(parcel, tx)
    check_version(tx, payload["expected_version"])
    if tx.status != "REGISTRATION_PENDING":
        fail("INVALID_TRANSITION", "Only a pending official application can be reviewed.")
    previous = tx.status
    if payload["decision"] == "REQUEST_CHANGES":
        # Clarification does not close the existing submitted official application.
        tx.application_status = "CHANGES_REQUIRED"
        tx.confirmed_by = []
    else:
        if not payload["official_reference"]:
            fail("VALIDATION_ERROR", "A verified application closure/withdrawal reference is required.", 422)
        # The assigned synthetic registrar records application closure, not title transfer.
        tx.application_status = "WITHDRAWN" if payload["decision"] == "VERIFY_WITHDRAWAL" else "REJECTED"
        tx.status = "CANCELLATION_PENDING"
        if tx.cancellation_case_id:
            case = locked(db, CancellationCase, tx.cancellation_case_id)
            if case.status in CLOSED_CANCELLATIONS:
                fail("INVALID_TRANSITION", "The prior cancellation case is already closed.")
            case.status = "UNDER_REVIEW"
            case.version += 1
        else:
            case = CancellationCase(
                id=str(uuid4()),
                transaction_id=tx.id,
                version=1,
                status="UNDER_REVIEW",
                requested_by=tx.seller_id,
                reason=payload["reason"],
                stage_at_request="REGISTRATION_PENDING",
                claimed_commitments=(tx.commitments or {}).get("reported", False),
                evidence_document_ids=[],
                responses=[],
                assigned_reviewer_id=assigned_user(db, "REVIEWER"),
                response_due_at=now() + timedelta(hours=settings.discussion_response_hours),
            )
            db.add(case)
            db.flush()
            tx.cancellation_case_id = case.id
        parcel.version += 1
    tx.version += 1
    reason = payload["reason"]
    if payload["official_reference"]:
        reason += f" [Synthetic official application reference: {payload['official_reference']}]"
    record(db, user, tx, "REGISTRATION_REVIEWED", previous, reason)
    db.flush()
    return transaction_dto(db, tx, user)


def list_invitations(db: Session, user: User, cursor, limit, listing_id=None) -> dict:
    query = select(Invitation)
    if listing_id:
        listing = get_or_404(db, Listing, listing_id)
        if listing.seller_id != user.id:
            fail("NOT_FOUND", "Listing not found.", 404)
        query = query.where(Invitation.listing_id == listing.id)
    else:
        query = query.where(Invitation.buyer_id == user.id)
    invitations = db.scalars(query.order_by(Invitation.id)).all()
    return page([invitation_dto(db, inv, user) for inv in invitations], cursor, limit)


def list_transactions(db: Session, user: User, cursor, limit) -> dict:
    ids = {user.id}
    conditions = [Transaction.seller_id.in_(ids), Transaction.buyer_id.in_(ids)]
    if "REGISTRAR" in user.roles:
        conditions.append(Transaction.assigned_registrar_id == user.id)
    if "REVIEWER" in user.roles:
        conditions.extend(
            [
                Transaction.listing_id.in_(select(Listing.id).where(Listing.assigned_reviewer_id == user.id)),
                Transaction.id.in_(
                    select(CancellationCase.transaction_id).where(
                        CancellationCase.assigned_reviewer_id == user.id
                    )
                ),
                Transaction.id.in_(
                    select(HoldCase.transaction_id).where(HoldCase.assigned_reviewer_id == user.id)
                ),
            ]
        )
    transactions = db.scalars(select(Transaction).where(or_(*conditions)).order_by(Transaction.id)).all()
    return page([transaction_dto(db, tx, user) for tx in transactions], cursor, limit)


def timeline_items(db: Session, tx: Transaction) -> list[dict]:
    resources = [tx.id, tx.parcel_id, tx.listing_id, tx.accepted_invitation_id]
    resources.extend(db.scalars(select(CancellationCase.id).where(CancellationCase.transaction_id == tx.id)))
    resources.extend(db.scalars(select(HoldCase.id).where(HoldCase.transaction_id == tx.id)))
    entries = db.scalars(
        select(Audit).where(Audit.resource_id.in_(resources)).order_by(Audit.occurred_at, Audit.id)
    ).all()
    return [
        {
            "id": entry.id,
            "actor_display": "System" if not entry.actor_id else "Authenticated participant/officer",
            "action": entry.action,
            "occurred_at": iso_utc(entry.occurred_at),
            "previous_state": entry.previous_state,
            "next_state": entry.next_state,
            # Free-text claims can contain private identity/evidence; the timeline is deliberately redacted.
            "reason": None,
        }
        for entry in entries
    ]


def report(db: Session, tx: Transaction, user: User) -> dict:
    """Contract report, reused by the authorized short-lived plaintext download."""
    transaction_access(db, tx, user)
    checks = db.scalars(
        select(OfficialCheck)
        .where(OfficialCheck.parcel_id == tx.parcel_id)
        .order_by(OfficialCheck.as_of, OfficialCheck.id)
    ).all()
    from app.models import VerificationJob

    jobs = db.scalars(
        select(VerificationJob)
        .where(VerificationJob.listing_id == tx.listing_id)
        .order_by(VerificationJob.created_at)
    ).all()
    unresolved = []
    if tx.status == "HOLD":
        unresolved.append("An assigned officer must resolve the hold; the parcel remains unavailable.")
    if tx.status == "CANCELLATION_PENDING":
        unresolved.append("Cancellation review and a fresh official availability check are required.")
    if (tx.commitments or {}).get("reported"):
        unresolved.append("Reported commitments are claims, not verified payments, and require review.")
    if tx.status == "REGISTRATION_PENDING":
        unresolved.append("Official application is pending; submission is not title transfer.")
    if not checks:
        unresolved.append("No official source check has been recorded.")
    return {
        "transaction_id": tx.id,
        "generated_at": iso_utc(now()),
        "integration_mode": "SIMULATED",
        "checked_sources": [
            {
                "id": c.id,
                "source": c.source,
                "status": c.status,
                "mode": c.mode,
                "as_of": iso_utc(c.as_of),
                "expires_at": iso_utc(c.expires_at),
                "authority_revision": c.authority_revision,
            }
            for c in checks
        ],
        "findings": [finding for job in jobs for finding in (job.findings or [])],
        "unresolved_items": unresolved,
        "status_history": timeline_items(db, tx),
        "registration_reference": tx.registration_reference,
    }


report_data = report
