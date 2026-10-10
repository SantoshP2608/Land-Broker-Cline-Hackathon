"""Contract enums and decimal-only conversion helpers, not state projections."""

import re
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext
from enum import StrEnum


class IdentityStatus(StrEnum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"


class ListingStatus(StrEnum):
    DRAFT = "DRAFT"
    UNDER_REVIEW = "UNDER_REVIEW"
    CHANGES_REQUIRED = "CHANGES_REQUIRED"
    APPROVED = "APPROVED"
    PUBLISHED = "PUBLISHED"
    WITHDRAWN = "WITHDRAWN"
    CLOSED = "CLOSED"


class ParcelStatus(StrEnum):
    OPEN = "OPEN"
    LOCKED = "LOCKED"
    HOLD = "HOLD"
    TRANSFERRED = "TRANSFERRED"


class InvitationStatus(StrEnum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    WITHDRAWN = "WITHDRAWN"
    EXPIRED = "EXPIRED"


class TransactionStatus(StrEnum):
    DISCUSSION = "DISCUSSION"
    AGREEMENT_PREPARATION = "AGREEMENT_PREPARATION"
    REGISTRATION_PENDING = "REGISTRATION_PENDING"
    CANCELLATION_PENDING = "CANCELLATION_PENDING"
    HOLD = "HOLD"
    CLOSED_CANCELLED = "CLOSED_CANCELLED"
    COMPLETED = "COMPLETED"


class CancellationStatus(StrEnum):
    REQUESTED = "REQUESTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    HOLD = "HOLD"
    RELEASE_APPROVED = "RELEASE_APPROVED"
    CLOSED_RELEASED = "CLOSED_RELEASED"
    CLOSED_NO_RELEASE = "CLOSED_NO_RELEASE"


class HoldStatus(StrEnum):
    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    RESOLVED_CONTINUE = "RESOLVED_CONTINUE"
    RESOLVED_CANCELLATION = "RESOLVED_CANCELLATION"
    RESOLVED_TRANSFER = "RESOLVED_TRANSFER"


class FindingStatus(StrEnum):
    MATCHES_SOURCE = "MATCHES_SOURCE"
    DISCREPANCY = "DISCREPANCY"
    EVIDENCE_MISSING = "EVIDENCE_MISSING"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class OfficialCheckStatus(StrEnum):
    UNKNOWN = "UNKNOWN"
    CURRENT = "CURRENT"
    TRANSFER_RECORDED = "TRANSFER_RECORDED"


class VerificationJobStatus(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class IntegrationMode(StrEnum):
    SIMULATED = "SIMULATED"
    CONNECTED = "CONNECTED"


class Availability(StrEnum):
    AVAILABLE = "AVAILABLE"
    RESERVED = "RESERVED"
    CANCELLATION_PENDING = "CANCELLATION_PENDING"
    ON_HOLD = "ON_HOLD"
    REGISTRATION_PENDING = "REGISTRATION_PENDING"
    TRANSFERRED = "TRANSFERRED"
    UNCONFIRMED = "UNCONFIRMED"


class Role(StrEnum):
    CITIZEN = "CITIZEN"
    REVIEWER = "REVIEWER"
    REGISTRAR = "REGISTRAR"
    ADMIN = "ADMIN"


class OwnerKind(StrEnum):
    USER = "USER"
    LISTING = "LISTING"
    TRANSACTION = "TRANSACTION"


class SharingScope(StrEnum):
    OWNER_AND_OFFICERS = "OWNER_AND_OFFICERS"
    TRANSACTION_PARTIES_AND_OFFICERS = "TRANSACTION_PARTIES_AND_OFFICERS"


class DocumentType(StrEnum):
    IDENTITY = "IDENTITY"
    PREVIOUS_DEED = "PREVIOUS_DEED"
    LAND_RECORD = "LAND_RECORD"
    ENCUMBRANCE_CERTIFICATE = "ENCUMBRANCE_CERTIFICATE"
    SUPPORTING_EVIDENCE = "SUPPORTING_EVIDENCE"
    LAND_PHOTO = "LAND_PHOTO"
    DRAFT_DEED = "DRAFT_DEED"
    REGISTERED_DEED = "REGISTERED_DEED"


class AllowedAction(StrEnum):
    SUBMIT_IDENTITY = "SUBMIT_IDENTITY"
    EDIT_LISTING = "EDIT_LISTING"
    UPLOAD_DOCUMENT = "UPLOAD_DOCUMENT"
    SUBMIT_REVIEW = "SUBMIT_REVIEW"
    PUBLISH_LISTING = "PUBLISH_LISTING"
    SEND_INVITATION = "SEND_INVITATION"
    ACCEPT_INVITATION = "ACCEPT_INVITATION"
    DECLINE_INVITATION = "DECLINE_INVITATION"
    WITHDRAW_INVITATION = "WITHDRAW_INVITATION"
    RECORD_OUTCOME = "RECORD_OUTCOME"
    SET_TERMS = "SET_TERMS"
    GENERATE_DEED = "GENERATE_DEED"
    CONFIRM_DEED = "CONFIRM_DEED"
    SUBMIT_REGISTRATION = "SUBMIT_REGISTRATION"
    REQUEST_CANCELLATION = "REQUEST_CANCELLATION"
    RESPOND_CANCELLATION = "RESPOND_CANCELLATION"
    SUBMIT_EVIDENCE = "SUBMIT_EVIDENCE"
    REVIEW_LISTING = "REVIEW_LISTING"
    REVIEW_IDENTITY = "REVIEW_IDENTITY"
    REVIEW_CANCELLATION = "REVIEW_CANCELLATION"
    REVIEW_HOLD = "REVIEW_HOLD"
    REVIEW_REGISTRATION = "REVIEW_REGISTRATION"
    SIMULATE_COMPLETION = "SIMULATE_COMPLETION"


class OriginalAreaUnit(StrEnum):
    SQM = "SQM"
    ACRE = "ACRE"
    GUNTHA = "GUNTHA"


class OutcomeChoice(StrEnum):
    CONTINUE = "CONTINUE"
    PROCEED = "PROCEED"
    CANCEL = "CANCEL"


class CancellationDecision(StrEnum):
    AGREE = "AGREE"
    DISAGREE = "DISAGREE"


class RegistrationProcessingResult(StrEnum):
    APPLIED = "APPLIED"
    ALREADY_PROCESSED = "ALREADY_PROCESSED"
    QUARANTINED = "QUARANTINED"


class IdentityDecision(StrEnum):
    CONFIRM = "CONFIRM"
    REQUEST_CHANGES = "REQUEST_CHANGES"
    REJECT = "REJECT"


class ListingDecision(StrEnum):
    APPROVE = "APPROVE"
    REQUEST_CHANGES = "REQUEST_CHANGES"
    REJECT = "REJECT"


class CancellationReviewDecision(StrEnum):
    RELEASE = "RELEASE"
    REQUIRE_REVIEW = "REQUIRE_REVIEW"


class HoldReviewDecision(StrEnum):
    RESUME = "RESUME"
    SEND_TO_CANCELLATION = "SEND_TO_CANCELLATION"
    ESCALATE = "ESCALATE"


class RegistrationDecision(StrEnum):
    REQUEST_CHANGES = "REQUEST_CHANGES"
    REJECT = "REJECT"
    VERIFY_WITHDRAWAL = "VERIFY_WITHDRAWAL"


class RegistrationEventType(StrEnum):
    REGISTRATION_COMPLETED = "REGISTRATION_COMPLETED"


class ErrorCode(StrEnum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    IDENTITY_NOT_CONFIRMED = "IDENTITY_NOT_CONFIRMED"
    PARCEL_NOT_AVAILABLE = "PARCEL_NOT_AVAILABLE"
    OFFICIAL_STATUS_UNKNOWN = "OFFICIAL_STATUS_UNKNOWN"
    REVIEW_NOT_CURRENT = "REVIEW_NOT_CURRENT"
    VERSION_CONFLICT = "VERSION_CONFLICT"
    INVALID_TRANSITION = "INVALID_TRANSITION"
    COMMITMENT_UNRESOLVED = "COMMITMENT_UNRESOLVED"
    DEED_CONFIRMATIONS_REQUIRED = "DEED_CONFIRMATIONS_REQUIRED"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    FILE_REJECTED = "FILE_REJECTED"
    RATE_LIMITED = "RATE_LIMITED"
    DEPENDENCY_UNAVAILABLE = "DEPENDENCY_UNAVAILABLE"


AREA_FACTORS: dict[str, Decimal] = {
    "sqm": Decimal("1"),
    "acre": Decimal("4046.8564224"),
    "guntha": Decimal("101.17141056"),
}
DECIMAL_PATTERN = re.compile(r"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?\Z")


def parse_decimal(value: str | Decimal, *, positive: bool = True) -> Decimal:
    """Reject binary floats, nonfinite values, exponents and Numeric(18,2) overflow."""
    if not isinstance(value, (str, Decimal)):
        raise ValueError("A decimal string is required.")
    if isinstance(value, str) and (len(value) > 64 or not DECIMAL_PATTERN.fullmatch(value)):
        raise ValueError("Use a plain nonnegative decimal string.")
    try:
        number = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("Invalid decimal value.") from exc
    if not number.is_finite() or number < 0 or (positive and number == 0):
        raise ValueError("Value must be finite and positive." if positive else "Value must be nonnegative.")
    if number >= Decimal("10000000000000000"):
        raise ValueError("Value exceeds the supported precision.")
    return number


def decimal_string(value: str | Decimal) -> str:
    with localcontext() as context:
        context.prec = 40
        number = parse_decimal(value, positive=False).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if number >= Decimal("10000000000000000"):
            raise ValueError("Value exceeds the supported precision.")
        return format(number, ".2f")


def to_sqm(original_area: str | Decimal, original_unit: str) -> Decimal:
    original_unit = original_unit.lower()
    if original_unit not in AREA_FACTORS:
        raise ValueError("Unsupported area unit; expected sqm, acre or guntha.")
    with localcontext() as context:
        context.prec = 40
        converted = parse_decimal(original_area) * AREA_FACTORS[original_unit]
        result = Decimal(decimal_string(converted))
    if result <= 0:
        raise ValueError("Area is too small for square-metre precision.")
    return result


def as_utc(value: datetime) -> datetime:
    """SQLite may drop timezone data in tests; all stored naive dates represent UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def iso_utc(value: datetime | None) -> str | None:
    return as_utc(value).isoformat().replace("+00:00", "Z") if value is not None else None


# Explicit aliases for the common domain terminology used by services.
CancellationCaseStatus = CancellationStatus
HoldCaseStatus = HoldStatus
AreaUnit = OriginalAreaUnit
money_string = decimal_string
area_to_sqm = to_sqm
