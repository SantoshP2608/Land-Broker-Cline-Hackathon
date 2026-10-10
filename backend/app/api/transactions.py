"""API contract 0.1: invitations, private transactions and assigned case reviews."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import success
from app.core.security import current_user
from app.db import get_db
from app.domain import parse_decimal
from app.models import CancellationCase, HoldCase, Invitation, Listing, Transaction, User
from app.services import transactions as workflow
from app.services.common import (
    cancellation_dto,
    command,
    get_or_404,
    hold_dto,
    page,
    transaction_dto,
)
from app.services.documents import issue_download

router = APIRouter(tags=["transactions"])
DB = Annotated[Session, Depends(get_db)]
Actor = Annotated[User, Depends(current_user)]
VersionNumber = Annotated[int, Field(ge=1, strict=True)]
EvidenceIDs = Annotated[list[UUID], Field(max_length=50)]
Reason = Annotated[str, Field(min_length=1, max_length=5000)]
DraftHash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Version(Strict):
    expected_version: VersionNumber


class Invite(Strict):
    message: str = Field(default="", max_length=2000)


class Accept(Version):
    expected_invitation_version: VersionNumber


class Claims(Version):
    reason: Reason
    claimed_commitments: bool = Field(default=False, strict=True)
    evidence_document_ids: EvidenceIDs = Field(default_factory=list)


class Outcome(Claims):
    choice: Literal["CONTINUE", "PROCEED", "CANCEL"]


class CancellationResponse(Claims):
    decision: Literal["AGREE", "DISAGREE"]


class Terms(Version):
    agreed_price_inr: str
    payment_terms_text: str = Field(min_length=1, max_length=5000)
    possession_terms_text: str = Field(min_length=1, max_length=5000)

    @field_validator("agreed_price_inr")
    @classmethod
    def price(cls, value: str) -> str:
        amount = parse_decimal(value)
        if amount.as_tuple().exponent < -2:
            raise ValueError("Use at most two fractional digits for INR.")
        return value


class DraftCommand(Version):
    draft_hash: DraftHash


class HoldEvidence(Strict):
    expected_version: VersionNumber | None = None
    expected_case_version: VersionNumber
    statement: Reason
    evidence_document_ids: EvidenceIDs = Field(default_factory=list)


class CancellationReview(Version):
    expected_transaction_version: VersionNumber
    decision: Literal["RELEASE", "REQUIRE_REVIEW"]
    reason: Reason
    evidence_document_ids: EvidenceIDs = Field(default_factory=list)


class HoldReview(Version):
    expected_transaction_version: VersionNumber | None = None
    decision: Literal["RESUME", "SEND_TO_CANCELLATION", "ESCALATE"]
    reason: Reason
    evidence_document_ids: EvidenceIDs = Field(default_factory=list)


class RegistrationReview(Version):
    decision: Literal["REQUEST_CHANGES", "REJECT", "VERIFY_WITHDRAWAL"]
    reason: Reason
    official_reference: str | None = Field(default=None, min_length=1, max_length=250)


def read_transaction(db: Session, user: User, resource_id: UUID) -> Transaction:
    tx = get_or_404(db, Transaction, str(resource_id))
    workflow.transaction_access(db, tx, user)
    return tx


def mutate_transaction(
    request: Request, db: Session, user: User, resource_id: UUID, body: BaseModel, fn, status=200
):
    # Authorization occurs before command() may replay a previously stored body.
    tx = get_or_404(db, Transaction, str(resource_id))
    workflow.party(tx, user)
    payload = body.model_dump(mode="json")
    return command(request, db, user, payload, lambda: fn(db, user, tx.id, payload), status)


@router.post("/listings/{id}/invitations", status_code=201)
def invitation_create(id: UUID, body: Invite, request: Request, user: Actor, db: DB):
    listing = get_or_404(db, Listing, str(id))
    own_invitation = db.scalar(
        select(Invitation.id).where(Invitation.listing_id == listing.id, Invitation.buyer_id == user.id)
    )
    if listing.status not in {"PUBLISHED", "CLOSED"} and not own_invitation and listing.seller_id != user.id:
        workflow.fail("NOT_FOUND", "Listing not found.", 404)
    payload = body.model_dump(mode="json")
    return command(
        request, db, user, payload, lambda: workflow.create_invitation(db, user, listing.id, payload), 201
    )


@router.get("/seller/listings/{id}/invitations")
def seller_invitations(
    id: UUID,
    request: Request,
    user: Actor,
    db: DB,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=50),
):
    return success(request, workflow.list_invitations(db, user, cursor, limit, str(id)))


@router.get("/buyer/invitations")
def buyer_invitations(
    request: Request, user: Actor, db: DB, cursor: str | None = None, limit: int = Query(20, ge=1, le=50)
):
    return success(request, workflow.list_invitations(db, user, cursor, limit))


@router.post("/invitations/{id}/accept", status_code=201)
def invitation_accept(id: UUID, body: Accept, request: Request, user: Actor, db: DB):
    inv = get_or_404(db, Invitation, str(id))
    workflow.invitation_access(db, inv, user, "accept")
    payload = body.model_dump(mode="json")
    return command(
        request, db, user, payload, lambda: workflow.accept_invitation(db, user, inv.id, payload), 201
    )


def invitation_mutate(id, body, request, user, db, action):
    inv = get_or_404(db, Invitation, str(id))
    workflow.invitation_access(db, inv, user, action)
    payload = body.model_dump(mode="json")
    return command(
        request, db, user, payload, lambda: workflow.invitation_decision(db, user, inv.id, payload, action)
    )


@router.post("/invitations/{id}/decline")
def invitation_decline(id: UUID, body: Version, request: Request, user: Actor, db: DB):
    return invitation_mutate(id, body, request, user, db, "decline")


@router.post("/invitations/{id}/withdraw")
def invitation_withdraw(id: UUID, body: Version, request: Request, user: Actor, db: DB):
    return invitation_mutate(id, body, request, user, db, "withdraw")


@router.get("/transactions")
def transaction_list(
    request: Request, user: Actor, db: DB, cursor: str | None = None, limit: int = Query(20, ge=1, le=50)
):
    return success(request, workflow.list_transactions(db, user, cursor, limit))


@router.get("/transactions/{id}")
def transaction_detail(id: UUID, request: Request, user: Actor, db: DB):
    return success(request, transaction_dto(db, read_transaction(db, user, id), user))


@router.get("/transactions/{id}/timeline")
def transaction_timeline(
    id: UUID,
    request: Request,
    user: Actor,
    db: DB,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=50),
):
    tx = read_transaction(db, user, id)
    return success(request, page(workflow.timeline_items(db, tx), cursor, limit))


@router.post("/transactions/{id}/outcomes")
def transaction_outcome(id: UUID, body: Outcome, request: Request, user: Actor, db: DB):
    return mutate_transaction(request, db, user, id, body, workflow.record_outcome)


@router.post("/transactions/{id}/terms")
def transaction_terms(id: UUID, body: Terms, request: Request, user: Actor, db: DB):
    return mutate_transaction(request, db, user, id, body, workflow.set_terms)


@router.post("/transactions/{id}/deed", status_code=201)
def transaction_deed(id: UUID, body: Version, request: Request, user: Actor, db: DB):
    return mutate_transaction(request, db, user, id, body, workflow.generate_deed, 201)


@router.post("/transactions/{id}/deed-confirmations")
def transaction_confirmation(id: UUID, body: DraftCommand, request: Request, user: Actor, db: DB):
    return mutate_transaction(request, db, user, id, body, workflow.confirm_deed)


@router.post("/transactions/{id}/registration-submit")
def transaction_registration(id: UUID, body: DraftCommand, request: Request, user: Actor, db: DB):
    return mutate_transaction(request, db, user, id, body, workflow.submit_registration)


@router.get("/transactions/{id}/report")
def transaction_report(id: UUID, request: Request, user: Actor, db: DB):
    return success(request, workflow.report(db, read_transaction(db, user, id), user))


@router.get("/transactions/{id}/report/download")
def transaction_report_download(id: UUID, request: Request, user: Actor, db: DB):
    tx = read_transaction(db, user, id)
    return success(request, issue_download(request, user, "report", tx.id))


@router.post("/transactions/{id}/cancellation", status_code=201)
def transaction_cancellation(id: UUID, body: Claims, request: Request, user: Actor, db: DB):
    return mutate_transaction(request, db, user, id, body, workflow.request_cancellation, 201)


@router.get("/cancellations/{id}")
def cancellation_detail(id: UUID, request: Request, user: Actor, db: DB):
    case = get_or_404(db, CancellationCase, str(id))
    workflow.cancellation_access(db, case, user)
    return success(request, cancellation_dto(case))


@router.post("/cancellations/{id}/response")
def cancellation_response(id: UUID, body: CancellationResponse, request: Request, user: Actor, db: DB):
    case = get_or_404(db, CancellationCase, str(id))
    tx = workflow.cancellation_access(db, case, user)
    workflow.party(tx, user)
    if case.requested_by == user.id:
        workflow.fail("FORBIDDEN", "Only the other party can respond to cancellation.", 403)
    payload = body.model_dump(mode="json")
    return command(
        request, db, user, payload, lambda: workflow.respond_cancellation(db, user, case.id, payload)
    )


@router.get("/holds/{id}")
def hold_detail(id: UUID, request: Request, user: Actor, db: DB):
    case = get_or_404(db, HoldCase, str(id))
    workflow.hold_access(db, case, user)
    return success(request, hold_dto(case))


@router.post("/holds/{id}/evidence")
def hold_evidence(id: UUID, body: HoldEvidence, request: Request, user: Actor, db: DB):
    case = get_or_404(db, HoldCase, str(id))
    tx = workflow.hold_access(db, case, user)
    if tx:
        workflow.party(tx, user)
    elif get_or_404(db, workflow.Parcel, case.parcel_id).owner_id != user.id:
        workflow.fail("FORBIDDEN", "Only the relevant party may submit evidence.", 403)
    payload = body.model_dump(mode="json")
    return command(
        request, db, user, payload, lambda: workflow.submit_hold_evidence(db, user, case.id, payload)
    )


@router.post("/reviews/cancellations/{id}/decision")
def cancellation_review(id: UUID, body: CancellationReview, request: Request, user: Actor, db: DB):
    case = get_or_404(db, CancellationCase, str(id))
    workflow.cancellation_access(db, case, user, reviewer=True)
    payload = body.model_dump(mode="json")
    return command(
        request, db, user, payload, lambda: workflow.review_cancellation(db, user, case.id, payload)
    )


@router.post("/reviews/holds/{id}/decision")
def hold_review(id: UUID, body: HoldReview, request: Request, user: Actor, db: DB):
    case = get_or_404(db, HoldCase, str(id))
    workflow.hold_access(db, case, user, reviewer=True)
    payload = body.model_dump(mode="json")
    return command(request, db, user, payload, lambda: workflow.review_hold(db, user, case.id, payload))


@router.post("/reviews/registrations/{transaction_id}/decision")
def registration_review(
    transaction_id: UUID, body: RegistrationReview, request: Request, user: Actor, db: DB
):
    tx = get_or_404(db, Transaction, str(transaction_id))
    workflow.registrar_access(tx, user)
    payload = body.model_dump(mode="json")
    return command(request, db, user, payload, lambda: workflow.review_registration(db, user, tx.id, payload))
