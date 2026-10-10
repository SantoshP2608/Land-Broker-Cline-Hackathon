"""Response contract models used for frontend type generation and validation."""

from datetime import datetime
from typing import Generic, Literal, TypeVar
from uuid import UUID

from fastapi.routing import APIRoute
from fastapi.utils import create_model_field
from pydantic import BaseModel, ConfigDict, Field

from app.domain import (
    AllowedAction,
    Availability,
    CancellationStatus,
    DocumentType,
    FindingStatus,
    HoldStatus,
    IdentityStatus,
    IntegrationMode,
    InvitationStatus,
    ListingStatus,
    OfficialCheckStatus,
    OwnerKind,
    ParcelStatus,
    SharingScope,
    TransactionStatus,
    VerificationJobStatus,
)


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Meta(DTO):
    request_id: str
    contract_version: Literal["0.1"]


T = TypeVar("T")


class Envelope(DTO, Generic[T]):
    data: T
    meta: Meta


class Page(DTO, Generic[T]):
    items: list[T]
    next_cursor: str | None


class UserDTO(DTO):
    id: UUID
    display_name: str
    roles: list[Literal["CITIZEN", "REVIEWER", "REGISTRAR", "ADMIN"]]
    identity_status: IdentityStatus
    identity_mode: IntegrationMode


class IdentityDTO(DTO):
    id: UUID
    user_id: UUID
    version: int
    status: IdentityStatus
    consent_at: datetime
    document_ids: list[UUID]
    mode: IntegrationMode
    reason: str | None


class OfficialDTO(DTO):
    id: UUID
    status: OfficialCheckStatus
    mode: IntegrationMode
    source: str
    as_of: datetime
    expires_at: datetime
    authority_revision: int


class LocationDTO(DTO):
    state_code: str
    district_code: str
    subdistrict_code: str
    village_code: str
    survey_number: str
    subdivision_number: str


class ReviewSummary(DTO):
    reviewed_at: datetime | None
    scope: str
    integration_mode: IntegrationMode


class PublicListingDTO(DTO):
    id: UUID
    version: int
    status: ListingStatus
    availability: Availability
    title: str
    description: str
    area_sqm: str
    land_type: str
    asking_price_inr: str
    location: LocationDTO
    photo_urls: list[str]
    review_summary: ReviewSummary
    allowed_actions: list[AllowedAction]


class ParcelDTO(DTO):
    id: UUID
    version: int
    status: ParcelStatus
    active_transaction_id: UUID | None
    official_check: OfficialDTO | None


class PrivateListingDTO(PublicListingDTO):
    seller_id: UUID
    parcel: ParcelDTO
    document_ids: list[UUID]
    finding_ids: list[UUID]
    blocked_reason: str | None


class InvitationDTO(DTO):
    id: UUID
    version: int
    listing_id: UUID
    buyer_id: UUID
    status: InvitationStatus
    created_at: datetime
    allowed_actions: list[AllowedAction]


class Commitments(DTO):
    reported: bool
    summary: str | None


class TermsDTO(DTO):
    agreed_price_inr: str
    payment_terms_text: str
    possession_terms_text: str
    version: int


class TransactionDTO(DTO):
    id: UUID
    version: int
    listing_id: UUID
    parcel_id: UUID
    seller_id: UUID
    buyer_id: UUID
    status: TransactionStatus
    resume_state: TransactionStatus | None
    closed_at: datetime | None
    availability: Availability
    commitments: Commitments
    terms: TermsDTO | None
    draft_document_id: UUID | None
    draft_hash: str | None
    confirmed_by: list[UUID]
    cancellation_case_id: UUID | None
    hold_case_id: UUID | None
    official_check: OfficialDTO | None
    integration_mode: IntegrationMode
    allowed_actions: list[AllowedAction]
    blocked_reason: str | None


class CancellationResponseDTO(DTO):
    user_id: UUID
    decision: Literal["AGREE", "DISAGREE"]
    reason: str
    claimed_commitments: bool
    evidence_document_ids: list[UUID]
    responded_at: datetime


class CancellationDTO(DTO):
    id: UUID
    version: int
    transaction_id: UUID
    status: CancellationStatus
    requested_by: UUID
    reason: str
    stage_at_request: TransactionStatus
    claimed_commitments: bool
    evidence_document_ids: list[UUID]
    responses: list[CancellationResponseDTO]
    response_due_at: datetime
    resolution_reason: str | None
    official_check_id: UUID | None
    resolved_at: datetime | None


class HoldDTO(DTO):
    id: UUID
    version: int
    parcel_id: UUID
    transaction_id: UUID | None
    status: HoldStatus
    reason_code: str
    summary: str
    evidence_document_ids: list[UUID]
    response_due_at: datetime
    assigned_reviewer_id: UUID | None
    resolution_reason: str | None
    resolved_at: datetime | None


class Authenticity(DTO):
    status: str
    source: str
    checked_at: datetime | None


class DocumentDTO(DTO):
    id: UUID
    owner_kind: OwnerKind
    owner_id: UUID
    document_type: DocumentType
    version: int
    filename: str
    sha256: str
    uploaded_at: datetime
    authenticity: Authenticity
    sharing_scope: SharingScope


class JobDTO(DTO):
    id: UUID
    listing_id: UUID
    status: VerificationJobStatus
    mode: IntegrationMode
    finding_ids: list[UUID]
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


class EvidenceDTO(DTO):
    document_id: UUID
    document_version: int
    page_number: int = Field(ge=1)
    field_name: str
    value: str
    source_date: str | None
    confidence: str | None


class FindingDTO(DTO):
    id: UUID
    rule_code: str
    status: FindingStatus
    summary: str
    left_evidence: EvidenceDTO | None
    right_evidence: EvidenceDTO | None
    reviewer_disposition: str | None


class AuditDTO(DTO):
    id: UUID
    actor_display: str
    action: str
    occurred_at: datetime
    previous_state: str | None
    next_state: str | None
    reason: str | None


class DownloadDTO(DTO):
    download_url: str
    expires_at: datetime


class QueueDTO(DTO):
    kind: str
    resource_id: UUID
    version: int
    transaction_version: int | None
    title: str
    assigned_at: datetime
    due_at: datetime | None


class NotificationDTO(DTO):
    id: UUID
    summary: str
    link: str
    created_at: datetime
    read_at: datetime | None


class ReviewedSubmission(DTO):
    listing: PrivateListingDTO
    verification_job: JobDTO


class Accepted(DTO):
    transaction: TransactionDTO
    listing: PrivateListingDTO
    invitation: InvitationDTO


class TransactionCancellation(DTO):
    transaction: TransactionDTO
    cancellation_case: CancellationDTO | None


class TransactionDeed(DTO):
    transaction: TransactionDTO
    document: DocumentDTO


class TransactionHold(DTO):
    hold_case: HoldDTO
    transaction: TransactionDTO | None


class CancellationDecision(DTO):
    transaction: TransactionDTO
    cancellation_case: CancellationDTO
    parcel: "ReleasedParcel"


class ReleasedParcel(DTO):
    id: UUID
    version: int
    status: ParcelStatus
    active_transaction_id: UUID | None


class UploadOwner(DTO):
    id: UUID
    version: int


class UploadResult(DTO):
    document: DocumentDTO
    owner: UploadOwner | None


class Processing(DTO):
    processing_result: Literal["APPLIED", "ALREADY_PROCESSED", "QUARANTINED"]


class SimulatedResult(Processing):
    transaction: TransactionDTO


class ReportDTO(DTO):
    transaction_id: UUID
    generated_at: datetime
    integration_mode: IntegrationMode
    checked_sources: list[OfficialDTO]
    findings: list[FindingDTO]
    unresolved_items: list[str]
    status_history: list[AuditDTO]
    registration_reference: str | None


class HealthDTO(DTO):
    contract_version: Literal["0.1"]
    integration_mode: IntegrationMode


class StateDTO(DTO):
    code: str
    name: str
    synthetic_only: bool


class ConfigurationDTO(DTO):
    policy_version: str
    supported_states: list[StateDTO]
    land_types: list[str]
    required_documents_by_land_type: dict[str, list[DocumentType]]
    allowed_original_area_units: list[Literal["SQM", "ACRE", "GUNTHA"]]
    max_upload_bytes: int
    allowed_file_types: list[str]
    integration_mode: IntegrationMode
    demo_notice: str


class ErrorDetail(DTO):
    code: str
    message: str
    field_errors: dict[str, list[str] | str]
    retryable: bool


class ErrorEnvelope(DTO):
    error: ErrorDetail
    meta: Meta


def response_type(path, method):
    """Explicit endpoint catalogue: no guessed field interfaces for frontend."""
    direct = {
        ("/health", "GET"): HealthDTO,
        ("/configuration", "GET"): ConfigurationDTO,
        ("/identity/me", "GET"): IdentityDTO | None,
        ("/identity/submissions", "POST"): IdentityDTO,
        ("/reviews/identity/{submission_id}/decision", "POST"): IdentityDTO,
        ("/listings", "GET"): Page[PublicListingDTO],
        ("/listings/{id}", "GET"): PublicListingDTO,
        ("/seller/listings", "GET"): Page[PrivateListingDTO],
        ("/seller/listings", "POST"): PrivateListingDTO,
        ("/seller/listings/{id}", "GET"): PrivateListingDTO,
        ("/seller/listings/{id}", "PATCH"): PrivateListingDTO,
        ("/seller/listings/{id}/submit-review", "POST"): ReviewedSubmission,
        ("/seller/listings/{id}/publish", "POST"): PrivateListingDTO,
        ("/verification-jobs/{id}", "GET"): JobDTO,
        ("/seller/listings/{id}/findings", "GET"): Page[FindingDTO],
        ("/documents", "POST"): UploadResult,
        ("/documents/{id}", "GET"): DocumentDTO,
        ("/documents/{id}/download", "GET"): DownloadDTO,
        ("/documents/{id}/share", "POST"): DocumentDTO,
        ("/listings/{id}/invitations", "POST"): InvitationDTO,
        ("/seller/listings/{id}/invitations", "GET"): Page[InvitationDTO],
        ("/buyer/invitations", "GET"): Page[InvitationDTO],
        ("/invitations/{id}/accept", "POST"): Accepted,
        ("/invitations/{id}/decline", "POST"): InvitationDTO,
        ("/invitations/{id}/withdraw", "POST"): InvitationDTO,
        ("/transactions", "GET"): Page[TransactionDTO],
        ("/transactions/{id}", "GET"): TransactionDTO,
        ("/transactions/{id}/timeline", "GET"): Page[AuditDTO],
        ("/transactions/{id}/outcomes", "POST"): TransactionCancellation,
        ("/transactions/{id}/terms", "POST"): TransactionDTO,
        ("/transactions/{id}/deed", "POST"): TransactionDeed,
        ("/transactions/{id}/deed-confirmations", "POST"): TransactionDTO,
        ("/transactions/{id}/registration-submit", "POST"): TransactionDTO,
        ("/transactions/{id}/report", "GET"): ReportDTO,
        ("/transactions/{id}/report/download", "GET"): DownloadDTO,
        ("/transactions/{id}/cancellation", "POST"): TransactionCancellation,
        ("/cancellations/{id}", "GET"): CancellationDTO,
        ("/cancellations/{id}/response", "POST"): TransactionCancellation,
        ("/holds/{id}", "GET"): HoldDTO,
        ("/holds/{id}/evidence", "POST"): TransactionHold,
        ("/reviews/queue", "GET"): Page[QueueDTO],
        ("/reviews/listings/{id}/decision", "POST"): PrivateListingDTO,
        ("/reviews/cancellations/{id}/decision", "POST"): CancellationDecision,
        ("/reviews/holds/{id}/decision", "POST"): TransactionHold,
        ("/reviews/registrations/{transaction_id}/decision", "POST"): TransactionDTO,
        ("/registrations/simulate", "POST"): SimulatedResult,
        ("/integrations/registration/events", "POST"): Processing,
        ("/notifications", "GET"): Page[NotificationDTO],
        ("/notifications/{id}/read", "POST"): NotificationDTO,
    }
    # Some router parameter names differ but do not change concrete URL paths.
    import re

    normalized = re.sub(
        r"\{(?:listing_id|invitation_id|tx_id|case_id|document_id|job_id|notification_id)\}", "{id}", path
    )
    return direct.get((normalized, method))


def apply_response_schemas(router):
    for route in router.routes:
        if not isinstance(route, APIRoute):
            continue
        path = route.path.removeprefix("/api/v1")
        if path.startswith("/auth") or path.startswith("/downloads/"):
            continue
        model = response_type(path, next(iter(route.methods)))
        if model is None:
            raise RuntimeError(f"Missing response schema for {route.path}")
        route.response_model = Envelope[model]
        route.response_field = create_model_field(
            name=f"Response_{route.unique_id}", type_=route.response_model, mode="serialization"
        )
        route.responses.update(
            {
                code: {"model": ErrorEnvelope, "description": "Contract error envelope"}
                for code in [401, 403, 404, 409, 422, 503]
            }
        )
        parameters = []
        if "POST" in route.methods or "PATCH" in route.methods:
            if path == "/integrations/registration/events":
                names = ["X-Event-ID", "X-Event-Timestamp", "X-Event-Signature"]
            else:
                names = ["Idempotency-Key", "X-CSRF-Token"]
            parameters = [
                {
                    "name": name,
                    "in": "header",
                    "required": True,
                    "schema": {"type": "string", **({"format": "uuid"} if name == "Idempotency-Key" else {})},
                }
                for name in names
            ]
        route.openapi_extra = {**(route.openapi_extra or {}), "parameters": parameters}
