"""Public marketplace and seller preparation endpoints."""

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, success
from app.core.security import current_user, optional_user
from app.db import get_db
from app.domain import Availability, parse_decimal
from app.models import Listing, Parcel, User, VerificationJob, utcnow
from app.services.common import (
    assigned_user,
    audit,
    check_identity,
    check_version,
    command,
    get_or_404,
    job_dto,
    listing_dto,
    lock_parcel,
    official_check,
    page,
)
from app.services.verification import document_set_hash, extraction_policy_version

router = APIRouter(tags=["listings"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Location(Strict):
    state_code: Literal["KA"]
    district_code: str = Field(min_length=1, max_length=80)
    subdistrict_code: str = Field(min_length=1, max_length=80)
    village_code: str = Field(min_length=1, max_length=80)
    survey_number: str = Field(min_length=1, max_length=80)
    subdivision_number: str = Field(min_length=1, max_length=80)


def positive_decimal(value):
    number = parse_decimal(value)
    if number.as_tuple().exponent < -2:
        raise ValueError("At most two fractional digits are supported.")
    return value


class CreateListing(Strict):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=1, max_length=5000)
    location: Location
    original_area: str
    original_unit: Literal["SQM", "ACRE", "GUNTHA"]
    land_type: Literal["DEMO_LAND"]
    asking_price_inr: str

    _amounts = field_validator("original_area", "asking_price_inr")(positive_decimal)


class EditListing(Strict):
    expected_version: int = Field(ge=1, strict=True)
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    asking_price_inr: str | None = None

    @field_validator("asking_price_inr")
    @classmethod
    def price(cls, value):
        return positive_decimal(value) if value is not None else value


class Version(Strict):
    expected_version: int = Field(ge=1, strict=True)


def private_listing(db, resource_id, user):
    listing = get_or_404(db, Listing, resource_id)
    if user.id != listing.seller_id and not (
        "REVIEWER" in user.roles and listing.assigned_reviewer_id == user.id
    ):
        raise ApiError(404, "NOT_FOUND", "Listing not visible.")
    return listing


@router.get("/listings")
def marketplace(
    request: Request,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=50),
    district_code: str | None = None,
    availability: Availability | None = None,
    user: User | None = Depends(optional_user),
    db: Session = Depends(get_db),
):
    listings = db.scalars(
        select(Listing).where(Listing.status.in_(["PUBLISHED", "CLOSED"])).order_by(Listing.id)
    ).all()
    items = [listing_dto(db, obj, user) for obj in listings]
    if district_code:
        items = [item for item in items if item["location"]["district_code"] == district_code]
    if availability:
        items = [item for item in items if item["availability"] == availability]
    return success(request, page(items, cursor, limit))


@router.get("/listings/{id}")
def public_detail(id: str, request: Request, user=Depends(optional_user), db: Session = Depends(get_db)):
    listing = get_or_404(db, Listing, id)
    if listing.status not in ["PUBLISHED", "CLOSED"]:
        raise ApiError(404, "NOT_FOUND", "Listing is not published.")
    return success(request, listing_dto(db, listing, user))


@router.get("/seller/listings")
def own_listings(
    request: Request,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=50),
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(select(Listing).where(Listing.seller_id == user.id).order_by(Listing.id)).all()
    return success(request, page([listing_dto(db, obj, user, True) for obj in rows], cursor, limit))


@router.get("/seller/listings/{id}")
def private_detail(id: str, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    return success(request, listing_dto(db, private_listing(db, id, user), user, True))


@router.post("/seller/listings", status_code=201)
def create(body: CreateListing, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    def run():
        check_identity(user)
        # Only reviewed, seeded canonical mappings exist in this synthetic jurisdiction.
        location = body.location.model_dump()
        parcel = next((p for p in db.scalars(select(Parcel)).all() if p.location == location), None)
        if parcel is None:
            raise ApiError(
                409,
                "REVIEW_NOT_CURRENT",
                "No reviewed synthetic parcel mapping exists for those identifiers.",
            )
        parcel = lock_parcel(db, parcel.id)
        if parcel.owner_id != user.id:
            raise ApiError(403, "FORBIDDEN", "The synthetic registry does not map you as owner.")
        if parcel.status != "OPEN" or parcel.active_transaction_id:
            raise ApiError(409, "PARCEL_NOT_AVAILABLE", "The parcel is reserved or transferred.")
        existing = db.scalar(
            select(Listing.id).where(
                Listing.parcel_id == parcel.id, Listing.status.notin_(["CLOSED", "WITHDRAWN"])
            )
        )
        if existing:
            raise ApiError(
                409, "INVALID_TRANSITION", "This parcel already has a listing; edit the existing draft."
            )
        multiplier = {
            "SQM": Decimal("1"),
            "ACRE": Decimal("4046.8564224"),
            "GUNTHA": Decimal("101.17141056"),
        }[body.original_unit]
        area = (Decimal(body.original_area) * multiplier).quantize(Decimal("0.01"))
        if area != parcel.area_sqm:
            raise ApiError(
                409, "REVIEW_NOT_CURRENT", "Submitted whole-parcel area differs from the synthetic registry."
            )
        listing = Listing(
            parcel_id=parcel.id,
            seller_id=user.id,
            title=body.title,
            description=body.description,
            land_type=body.land_type,
            asking_price_inr=Decimal(body.asking_price_inr),
            original_area=body.original_area,
            original_unit=body.original_unit,
            assigned_reviewer_id=assigned_user(db, "REVIEWER"),
        )
        db.add(listing)
        db.flush()
        audit(db, user, listing, "LISTING_CREATED", None, listing.status, recipients=[user.id])
        return listing_dto(db, listing, user, True)

    return command(request, db, user, body.model_dump(), run, 201)


@router.patch("/seller/listings/{id}")
def edit(
    id: str, body: EditListing, request: Request, user=Depends(current_user), db: Session = Depends(get_db)
):
    def run():
        listing = private_listing(db, id, user)
        if listing.seller_id != user.id:
            raise ApiError(403, "FORBIDDEN", "Only the seller can edit.")
        parcel = lock_parcel(db, listing.parcel_id)
        db.refresh(listing)
        check_version(listing, body.expected_version)
        if listing.status not in ["DRAFT", "CHANGES_REQUIRED", "APPROVED"] or parcel.status != "OPEN":
            raise ApiError(409, "INVALID_TRANSITION", "Listing is not editable at this stage.")
        previous = listing.status
        for name, value in body.model_dump(exclude={"expected_version"}, exclude_unset=True).items():
            if value is None:
                raise ApiError(422, "VALIDATION_ERROR", "Editable values cannot be null.")
            setattr(listing, name, Decimal(value) if name == "asking_price_inr" else value)
        listing.status = "DRAFT"
        listing.approved_document_set_hash = None
        listing.version += 1
        listing.updated_at = utcnow()
        audit(db, user, listing, "LISTING_EDITED", previous, listing.status)
        return listing_dto(db, listing, user, True)

    return command(request, db, user, body.model_dump(), run)


@router.post("/seller/listings/{id}/submit-review", status_code=202)
def submit(
    id: str, body: Version, request: Request, user=Depends(current_user), db: Session = Depends(get_db)
):
    def run():
        listing = private_listing(db, id, user)
        if listing.seller_id != user.id:
            raise ApiError(403, "FORBIDDEN", "Only the seller may submit.")
        check_identity(user)
        parcel = lock_parcel(db, listing.parcel_id)
        db.refresh(listing)
        check_version(listing, body.expected_version)
        if listing.status not in ["DRAFT", "CHANGES_REQUIRED"] or parcel.status != "OPEN":
            raise ApiError(409, "INVALID_TRANSITION", "Cannot submit at this stage.")
        previous = listing.status
        listing.status = "UNDER_REVIEW"
        listing.version += 1
        listing.approved_document_set_hash = None
        job = VerificationJob(
            listing_id=listing.id,
            status="QUEUED",
            mode="SIMULATED",
            policy_version=extraction_policy_version(),
            document_set_hash=document_set_hash(db, listing.id),
        )
        db.add(job)
        db.flush()
        audit(
            db,
            user,
            listing,
            "REVIEW_SUBMITTED",
            previous,
            listing.status,
            recipients=[listing.assigned_reviewer_id],
        )
        return {"listing": listing_dto(db, listing, user, True), "verification_job": job_dto(job)}

    return command(request, db, user, body.model_dump(), run, 202)


@router.get("/verification-jobs/{id}")
def job_detail(id: str, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    job = get_or_404(db, VerificationJob, id)
    private_listing(db, job.listing_id, user)
    return success(request, job_dto(job))


@router.get("/seller/listings/{id}/findings")
def findings(
    id: str,
    request: Request,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=50),
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    private_listing(db, id, user)
    job = db.scalar(
        select(VerificationJob)
        .where(VerificationJob.listing_id == id)
        .order_by(VerificationJob.created_at.desc())
    )
    return success(request, page(job.findings or [] if job else [], cursor, limit))


@router.post("/seller/listings/{id}/publish")
def publish(
    id: str, body: Version, request: Request, user=Depends(current_user), db: Session = Depends(get_db)
):
    def run():
        listing = private_listing(db, id, user)
        if listing.seller_id != user.id:
            raise ApiError(403, "FORBIDDEN", "Only the seller may publish.")
        check_identity(user)
        parcel = lock_parcel(db, listing.parcel_id)
        db.refresh(listing)
        check_version(listing, body.expected_version)
        if listing.status != "APPROVED" or listing.approved_document_set_hash != document_set_hash(
            db, listing.id
        ):
            raise ApiError(409, "REVIEW_NOT_CURRENT", "A current approved document set is required.")
        if parcel.status != "OPEN" or parcel.active_transaction_id or parcel.owner_id != user.id:
            raise ApiError(409, "PARCEL_NOT_AVAILABLE", "Parcel cannot be published.")
        official_check(db, parcel)
        listing.status = "PUBLISHED"
        listing.version += 1
        audit(db, user, listing, "LISTING_PUBLISHED", "APPROVED", "PUBLISHED")
        return listing_dto(db, listing, user, True)

    return command(request, db, user, body.model_dump(), run)
