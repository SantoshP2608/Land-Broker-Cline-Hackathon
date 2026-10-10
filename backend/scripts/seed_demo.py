"""Idempotent synthetic fixtures; never reset an existing marketplace workflow.

Run from the backend directory: python -m scripts.seed_demo
The shared password is DEMO ONLY, not a production account provisioning scheme.
The listing reviews are deliberately seeded simulated fixtures, not assertions
of authenticity, legal title, or an independently executed verification process.
"""

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db import SessionLocal
from app.models import Document, Invitation, Listing, OfficialCheck, Parcel, User, VerificationJob
from app.services.documents import store_document, synthetic_pdf
from app.services.verification import document_set_hash

DEMO_PASSWORD = "DemoPass123!"
POLICY_VERSION = "KA-SYNTHETIC-0.1"


def demo_id(number: int) -> str:
    return f"00000000-0000-4000-8000-{number:012d}"


USERS = (
    ("seller", 1, "seller@demo.local", "Synthetic Seller", "CITIZEN", "DEMO-SELLER-001"),
    ("buyer_a", 2, "buyer.a@demo.local", "Synthetic Buyer A", "CITIZEN", "DEMO-BUYER-001"),
    ("buyer_b", 3, "buyer.b@demo.local", "Synthetic Buyer B", "CITIZEN", "DEMO-BUYER-002"),
    ("reviewer", 4, "reviewer@demo.local", "Synthetic Reviewer", "REVIEWER", "DEMO-REVIEWER-001"),
    ("registrar", 5, "registrar@demo.local", "Synthetic Registrar", "REGISTRAR", "DEMO-REGISTRAR-001"),
    ("outsider", 6, "outsider@demo.local", "Synthetic Unrelated Citizen", "CITIZEN", "DEMO-OUTSIDER-001"),
)


def demo_location(survey: str) -> dict[str, str]:
    return {
        "state_code": "KA",
        "district_code": "KA-DEMO-D",
        "subdistrict_code": "KA-DEMO-S",
        "village_code": "KA-DEMO-V",
        "survey_number": survey,
        "subdivision_number": "A",
    }


def seed(db: Session) -> dict[str, str]:
    """Add missing fixtures in the caller's transaction and return deterministic IDs.

    Existing rows, passwords, approvals, ownership, and reservations are preserved.
    The caller commits. Private files are immutable, like ordinary upload storage.
    """
    if settings.official_integration_mode != "SIMULATED" or settings.app_env.lower() not in {
        "development",
        "local",
        "test",
        "testing",
    }:
        raise RuntimeError("Demo accounts may only be seeded in a local SIMULATED environment.")
    ids = {name: demo_id(number) for name, number, *_ in USERS}
    for name, number, email, display_name, role, subject_ref in USERS:
        existing = db.get(User, demo_id(number))
        by_email = db.scalar(select(User).where(User.email == email))
        if by_email is not None and by_email.id != demo_id(number):
            raise RuntimeError(f"Refusing to overwrite unrelated account {email}.")
        if existing is None:
            db.add(
                User(
                    id=demo_id(number),
                    email=email,
                    display_name=display_name,
                    password_hash=hash_password(DEMO_PASSWORD),
                    roles=[role],
                    identity_status="CONFIRMED",
                    identity_mode="SIMULATED",
                    subject_ref=subject_ref,
                    disabled=False,
                )
            )
    db.flush()
    seller = db.get(User, ids["seller"])
    now = datetime.now(UTC)
    for index, narrative in enumerate(
        ("successful transfer", "early cancellation and release", "disputed hold", "creation")
    ):
        survey = f"{index + 1:03d}"
        parcel_id = demo_id(10 + index)
        ids[f"parcel_{index + 1}"] = parcel_id
        if db.get(Parcel, parcel_id) is None:
            db.add(
                Parcel(
                    id=parcel_id,
                    canonical_key=f"KA|KA-DEMO-D|KA-DEMO-S|KA-DEMO-V|{survey}|A",
                    provider_parcel_ref=f"DEMO/PARCEL/{survey}",
                    location=demo_location(survey),
                    area_sqm=Decimal("1200.00"),
                    owner_id=seller.id,
                    status="OPEN",
                    active_transaction_id=None,
                    authority_revision=1,
                    official_status="CURRENT",
                    official_available=True,
                )
            )
            db.flush()
            db.add(
                OfficialCheck(
                    id=demo_id(70 + index),
                    parcel_id=parcel_id,
                    status="CURRENT",
                    mode="SIMULATED",
                    source="Seeded synthetic Karnataka registry",
                    as_of=now,
                    expires_at=now + timedelta(seconds=settings.official_check_max_age_seconds),
                    authority_revision=1,
                )
            )
        if index == 3:
            continue
        listing_id = demo_id(20 + index)
        ids[f"listing_{index + 1}"] = listing_id
        if db.get(Listing, listing_id) is not None:
            continue
        parcel = db.get(Parcel, parcel_id)
        if parcel.owner_id != seller.id or parcel.status != "OPEN" or parcel.active_transaction_id:
            raise RuntimeError("Refusing to seed an eligible listing over an existing parcel workflow.")
        listing = Listing(
            id=listing_id,
            parcel_id=parcel_id,
            seller_id=seller.id,
            version=3,
            status="PUBLISHED",
            title=f"Synthetic parcel {survey}: {narrative}",
            description="SIMULATED DEMONSTRATION. Fake whole parcel; no legal/title assurance.",
            land_type="DEMO_LAND",
            asking_price_inr=Decimal("2500000.00"),
            original_area="1200.00",
            original_unit="SQM",
            reviewed_at=now,
            assigned_reviewer_id=ids["reviewer"],
        )
        db.add(listing)
        db.flush()
        text = f"Survey: {survey}\nArea sqm: 1200.00\nOwner subject: DEMO-SELLER-001\nSIMULATED DEMONSTRATION"
        for document_type in ("PREVIOUS_DEED", "LAND_RECORD", "ENCUMBRANCE_CERTIFICATE"):
            # Check explicitly to make the fixture's document multiplicity invariant clear.
            if (
                db.scalar(
                    select(Document.id).where(
                        Document.owner_kind == "LISTING",
                        Document.owner_id == listing_id,
                        Document.document_type == document_type,
                    )
                )
                is None
            ):
                store_document(
                    db,
                    seller,
                    "LISTING",
                    listing_id,
                    document_type,
                    f"synthetic-{survey}-{document_type.lower()}.pdf",
                    synthetic_pdf(text),
                    "OWNER_AND_OFFICERS",
                )
        db.flush()
        listing.approved_document_set_hash = document_set_hash(db, listing_id)
        db.add(
            VerificationJob(
                id=demo_id(90 + index),
                listing_id=listing_id,
                status="COMPLETED",
                mode="SIMULATED",
                document_set_hash=listing.approved_document_set_hash,
                policy_version=POLICY_VERSION,
                findings=[],
                created_at=now,
                completed_at=now,
                attempt=1,
            )
        )
    db.flush()
    for number, buyer_key in ((30, "buyer_a"), (31, "buyer_b")):
        invitation_id = demo_id(number)
        ids[f"invitation_{buyer_key}"] = invitation_id
        listing = db.get(Listing, ids["listing_1"])
        parcel = db.get(Parcel, ids["parcel_1"])
        if (
            db.get(Invitation, invitation_id) is None
            and listing.status == "PUBLISHED"
            and parcel.status == "OPEN"
        ):
            pending = db.scalar(
                select(Invitation.id).where(
                    Invitation.listing_id == listing.id,
                    Invitation.buyer_id == ids[buyer_key],
                    Invitation.status == "PENDING",
                )
            )
            if pending is None:
                db.add(
                    Invitation(
                        id=invitation_id,
                        listing_id=listing.id,
                        buyer_id=ids[buyer_key],
                        status="PENDING",
                        version=1,
                        message="Synthetic demonstration invitation.",
                    )
                )
    db.flush()
    return ids


def main() -> None:
    with SessionLocal() as db:
        try:
            ids = seed(db)
            db.commit()
        except Exception:
            db.rollback()
            raise
    print("SIMULATED DEMONSTRATION ONLY; shared demo password: " + DEMO_PASSWORD)
    print(json.dumps(ids, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
