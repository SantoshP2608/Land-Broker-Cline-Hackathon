"""Relational persistence for the synthetic demonstration.

JSON collections are ordinary JSON: assign a new list/dict when changing them.
Services own state transitions and commits; constraints are a second safety guard.
"""

from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.domain import (
    CancellationStatus,
    DocumentType,
    HoldStatus,
    IdentityStatus,
    IntegrationMode,
    InvitationStatus,
    ListingStatus,
    OfficialCheckStatus,
    OriginalAreaUnit,
    OwnerKind,
    ParcelStatus,
    RegistrationProcessingResult,
    SharingScope,
    TransactionStatus,
    VerificationJobStatus,
)


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid4())


def enum_check(column: str, values: type[StrEnum], name: str) -> CheckConstraint:
    allowed = ", ".join(f"'{member.value}'" for member in values)
    return CheckConstraint(f"{column} IN ({allowed})", name=name)


class Base(DeclarativeBase):
    pass


class Versioned:
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        enum_check("identity_status", IdentityStatus, "ck_user_identity_status"),
        enum_check("identity_mode", IntegrationMode, "ck_user_identity_mode"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    roles: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["CITIZEN"], nullable=False)
    identity_status: Mapped[str] = mapped_column(String(24), default="PENDING", server_default="PENDING")
    identity_mode: Mapped[str] = mapped_column(String(24), default="SIMULATED", server_default="SIMULATED")
    subject_ref: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))


class Session(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class Parcel(Versioned, Timestamps, Base):
    __tablename__ = "parcels"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_parcel_version"),
        CheckConstraint("area_sqm > 0", name="ck_parcel_area_positive"),
        CheckConstraint("authority_revision >= 1", name="ck_parcel_authority_revision"),
        enum_check("status", ParcelStatus, "ck_parcel_status"),
        enum_check("official_status", OfficialCheckStatus, "ck_parcel_official_status"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    canonical_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    provider_parcel_ref: Mapped[str] = mapped_column(String(250), unique=True, nullable=False)
    location: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    area_sqm: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    owner_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(24), default="OPEN", server_default="OPEN")
    active_transaction_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False),
        ForeignKey(
            "transactions.id",
            name="fk_parcel_active_transaction",
            use_alter=True,
            deferrable=True,
            initially="DEFERRED",
        ),
        nullable=True,
        unique=True,
    )
    authority_revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    official_status: Mapped[str] = mapped_column(String(24), default="CURRENT", server_default="CURRENT")
    official_available: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))


class Listing(Versioned, Timestamps, Base):
    __tablename__ = "listings"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_listing_version"),
        CheckConstraint("asking_price_inr >= 0", name="ck_listing_asking_price"),
        enum_check("status", ListingStatus, "ck_listing_status"),
        enum_check("original_unit", OriginalAreaUnit, "ck_listing_original_unit"),
        Index(
            "uq_listing_nonclosed_parcel",
            "parcel_id",
            unique=True,
            postgresql_where=text("status NOT IN ('CLOSED', 'WITHDRAWN')"),
            sqlite_where=text("status NOT IN ('CLOSED', 'WITHDRAWN')"),
        ),
        Index("ix_listing_seller_status", "seller_id", "status"),
        Index("ix_listing_reviewer_status", "assigned_reviewer_id", "status"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    parcel_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("parcels.id"))
    seller_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(24), default="DRAFT", server_default="DRAFT")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    land_type: Mapped[str] = mapped_column(String(64), nullable=False)
    asking_price_inr: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    original_area: Mapped[str] = mapped_column(String(64), nullable=False)
    original_unit: Mapped[str] = mapped_column(String(24), nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_document_set_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assigned_reviewer_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("users.id"), nullable=True
    )


class Document(Versioned, Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_document_version"),
        CheckConstraint("size_bytes > 0", name="ck_document_size"),
        enum_check("owner_kind", OwnerKind, "ck_document_owner_kind"),
        enum_check("document_type", DocumentType, "ck_document_type"),
        enum_check("sharing_scope", SharingScope, "ck_document_sharing_scope"),
        Index("ix_document_owner_type", "owner_kind", "owner_id", "document_type"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    owner_kind: Mapped[str] = mapped_column(String(24), nullable=False)
    # Polymorphic owner: validated by the authorising service, not a false single-table FK.
    owner_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False)
    uploader_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"), index=True)
    document_type: Mapped[str] = mapped_column(String(64), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    mime: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sharing_scope: Mapped[str] = mapped_column(String(64), default="OWNER_AND_OFFICERS", nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class IdentitySubmission(Versioned, Timestamps, Base):
    __tablename__ = "identity_submissions"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_identity_submission_version"),
        enum_check("status", IdentityStatus, "ck_identity_submission_status"),
        enum_check("mode", IntegrationMode, "ck_identity_submission_mode"),
        Index("ix_identity_submission_user_created", "user_id", "created_at"),
        Index("ix_identity_submission_reviewer_status", "assigned_reviewer_id", "status"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(24), default="PENDING", server_default="PENDING")
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    document_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    mode: Mapped[str] = mapped_column(String(24), default="SIMULATED", server_default="SIMULATED")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_reviewer_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("users.id"), nullable=True
    )


class VerificationJob(Base):
    __tablename__ = "verification_jobs"
    __table_args__ = (
        CheckConstraint("attempt >= 0", name="ck_verification_job_attempt"),
        enum_check("status", VerificationJobStatus, "ck_verification_job_status"),
        enum_check("mode", IntegrationMode, "ck_verification_job_mode"),
        Index("ix_verification_job_status_lease", "status", "lease_until"),
        Index("ix_verification_job_listing_hash", "listing_id", "document_set_hash"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    listing_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("listings.id"))
    status: Mapped[str] = mapped_column(String(24), default="QUEUED", server_default="QUEUED")
    mode: Mapped[str] = mapped_column(String(24), default="SIMULATED", server_default="SIMULATED")
    document_set_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(64), nullable=False)
    findings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class Invitation(Versioned, Base):
    __tablename__ = "invitations"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_invitation_version"),
        enum_check("status", InvitationStatus, "ck_invitation_status"),
        Index(
            "uq_invitation_pending_buyer_listing",
            "buyer_id",
            "listing_id",
            unique=True,
            postgresql_where=text("status = 'PENDING'"),
            sqlite_where=text("status = 'PENDING'"),
        ),
        Index("ix_invitation_listing_status", "listing_id", "status"),
        Index("ix_invitation_buyer_status", "buyer_id", "status"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    listing_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("listings.id"))
    buyer_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(24), default="PENDING", server_default="PENDING")
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Transaction(Versioned, Timestamps, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_transaction_version"),
        CheckConstraint("buyer_id <> seller_id", name="ck_transaction_different_parties"),
        CheckConstraint(
            "(status IN ('CLOSED_CANCELLED', 'COMPLETED') AND closed_at IS NOT NULL) OR "
            "(status NOT IN ('CLOSED_CANCELLED', 'COMPLETED') AND closed_at IS NULL)",
            name="ck_transaction_terminal_closed_at",
        ),
        enum_check("status", TransactionStatus, "ck_transaction_status"),
        enum_check("resume_state", TransactionStatus, "ck_transaction_resume_state"),
        Index(
            "uq_transaction_active_parcel",
            "parcel_id",
            unique=True,
            postgresql_where=text("closed_at IS NULL"),
            sqlite_where=text("closed_at IS NULL"),
        ),
        Index("ix_transaction_seller_status", "seller_id", "status"),
        Index("ix_transaction_buyer_status", "buyer_id", "status"),
        Index("ix_transaction_registrar_status", "assigned_registrar_id", "status"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    parcel_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("parcels.id"))
    listing_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("listings.id"), index=True)
    seller_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"))
    buyer_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"))
    accepted_invitation_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("invitations.id"), unique=True
    )
    status: Mapped[str] = mapped_column(String(32), default="DISCUSSION", server_default="DISCUSSION")
    resume_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    terms: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    draft_document_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("documents.id"), nullable=True
    )
    draft_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confirmed_by: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    outcomes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    commitments: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=lambda: {"reported": False, "summary": None}, nullable=False
    )
    cancellation_case_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False),
        ForeignKey(
            "cancellation_cases.id",
            name="fk_transaction_cancellation_case",
            use_alter=True,
            deferrable=True,
            initially="DEFERRED",
        ),
        nullable=True,
    )
    hold_case_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False),
        ForeignKey(
            "hold_cases.id",
            name="fk_transaction_hold_case",
            use_alter=True,
            deferrable=True,
            initially="DEFERRED",
        ),
        nullable=True,
    )
    assigned_registrar_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("users.id"), nullable=True
    )
    registration_reference: Mapped[str | None] = mapped_column(String(250), nullable=True)
    application_status: Mapped[str | None] = mapped_column(String(64), nullable=True)


class CancellationCase(Versioned, Timestamps, Base):
    __tablename__ = "cancellation_cases"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_cancellation_case_version"),
        enum_check("status", CancellationStatus, "ck_cancellation_case_status"),
        enum_check("stage_at_request", TransactionStatus, "ck_cancellation_case_stage"),
        Index(
            "uq_cancellation_case_active_transaction",
            "transaction_id",
            unique=True,
            postgresql_where=text("status NOT IN ('CLOSED_RELEASED', 'CLOSED_NO_RELEASE')"),
            sqlite_where=text("status NOT IN ('CLOSED_RELEASED', 'CLOSED_NO_RELEASE')"),
        ),
        Index("ix_cancellation_case_assignment_due", "assigned_reviewer_id", "status", "response_due_at"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    transaction_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("transactions.id"))
    status: Mapped[str] = mapped_column(String(32), default="REQUESTED", server_default="REQUESTED")
    requested_by: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    stage_at_request: Mapped[str] = mapped_column(String(32), nullable=False)
    claimed_commitments: Mapped[bool] = mapped_column(JSON, default=False, nullable=False)
    evidence_document_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    responses: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    response_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    assigned_reviewer_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("users.id"), nullable=True
    )
    resolution_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    official_check_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("official_checks.id"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HoldCase(Versioned, Timestamps, Base):
    __tablename__ = "hold_cases"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_hold_case_version"),
        enum_check("status", HoldStatus, "ck_hold_case_status"),
        Index("ix_hold_case_assignment_due", "assigned_reviewer_id", "status", "response_due_at"),
        Index("ix_hold_case_parcel_status", "parcel_id", "status"),
        Index("ix_hold_case_transaction", "transaction_id"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    parcel_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("parcels.id"))
    transaction_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("transactions.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), default="OPEN", server_default="OPEN")
    reason_code: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_document_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    response_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    assigned_reviewer_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("users.id"), nullable=True
    )
    resolution_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OfficialCheck(Base):
    __tablename__ = "official_checks"
    __table_args__ = (
        enum_check("status", OfficialCheckStatus, "ck_official_check_status"),
        enum_check("mode", IntegrationMode, "ck_official_check_mode"),
        CheckConstraint("authority_revision >= 1", name="ck_official_check_authority_revision"),
        Index("ix_official_check_parcel_as_of", "parcel_id", "as_of"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    parcel_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("parcels.id"))
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    mode: Mapped[str] = mapped_column(String(24), default="SIMULATED", server_default="SIMULATED")
    source: Mapped[str] = mapped_column(String(250), nullable=False)
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    authority_revision: Mapped[int] = mapped_column(Integer, nullable=False)


class RegistrationEvent(Base):
    __tablename__ = "registration_events"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_registration_provider_event"),
        enum_check("processing_result", RegistrationProcessingResult, "ck_registration_processing_result"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    event_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    processing_result: Mapped[str] = mapped_column(String(32), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Idempotency(Base):
    __tablename__ = "idempotency"
    __table_args__ = (
        UniqueConstraint("actor_id", "method", "route", "key", name="uq_idempotency_actor_method_route_key"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    actor_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"))
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    route: Mapped[str] = mapped_column(String(500), nullable=False)
    key: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class Audit(Base):
    __tablename__ = "audit"
    __table_args__ = (Index("ix_audit_resource_time", "resource_id", "occurred_at"),)

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    actor_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"), nullable=True)
    resource_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    previous_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    next_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class Outbox(Base):
    __tablename__ = "outbox"
    __table_args__ = (
        CheckConstraint("attempt >= 0", name="ck_outbox_attempt"),
        Index("ix_outbox_delivery", "completed_at", "next_attempt_at"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), unique=True, nullable=False, default=new_id)
    recipients: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_notification_user_event"),
        Index("ix_notification_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("users.id"))
    event_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("outbox.event_id"))
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    link: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
