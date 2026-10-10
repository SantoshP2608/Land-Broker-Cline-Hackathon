"""Focused workflow checks; PostgreSQL concurrency is covered by integration tests."""

from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.transactions import Accept, Claims, Terms
from app.core.errors import ApiError
from app.models import Base, CancellationCase, HoldCase, Invitation, Listing, Parcel, Transaction, User
from app.services import transactions as flow
from app.services.verification import document_set_hash


@pytest.fixture
def world():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, autoflush=False, expire_on_commit=False) as db:
        users = []
        for name, role in (
            ("Seller", "CITIZEN"),
            ("Buyer A", "CITIZEN"),
            ("Buyer B", "CITIZEN"),
            ("Reviewer", "REVIEWER"),
            ("Registrar", "REGISTRAR"),
        ):
            user = User(
                id=str(uuid4()),
                display_name=name,
                email=f"{uuid4()}@example.test",
                password_hash="synthetic-test-only",
                roles=[role],
                identity_status="CONFIRMED",
            )
            db.add(user)
            users.append(user)
        db.flush()
        seller, buyer, rival, reviewer, registrar = users
        parcel = Parcel(
            id=str(uuid4()),
            canonical_key=str(uuid4()),
            provider_parcel_ref=str(uuid4()),
            owner_id=seller.id,
            area_sqm=Decimal("1000.00"),
            location={"state_code": "KA"},
        )
        db.add(parcel)
        db.flush()
        listing = Listing(
            id=str(uuid4()),
            parcel_id=parcel.id,
            seller_id=seller.id,
            title="Synthetic parcel",
            description="No real land",
            land_type="DEMO_LAND",
            asking_price_inr=Decimal("100.00"),
            original_area="1000.00",
            original_unit="SQM",
            status="PUBLISHED",
            approved_document_set_hash="a" * 64,
            assigned_reviewer_id=reviewer.id,
        )
        db.add(listing)
        db.flush()
        listing.approved_document_set_hash = document_set_hash(db, listing.id)
        invitations = [
            Invitation(id=str(uuid4()), listing_id=listing.id, buyer_id=person.id)
            for person in (buyer, rival)
        ]
        db.add_all(invitations)
        db.commit()
        yield db, seller, buyer, rival, reviewer, registrar, parcel, listing, invitations
    engine.dispose()


def accept(world):
    db, seller, _, _, _, _, parcel, _, invitations = world
    data = flow.accept_invitation(
        db, seller, invitations[0].id, {"expected_version": parcel.version, "expected_invitation_version": 1}
    )
    db.commit()
    return db.get(Transaction, data["transaction"]["id"])


def claims(version, **extra):
    return {
        "expected_version": version,
        "reason": "Synthetic discussion ended",
        "claimed_commitments": False,
        "evidence_document_ids": [],
        **extra,
    }


def test_strict_contract_and_versions():
    assert Claims(expected_version=1, reason="Demo").claimed_commitments is False
    for invalid in (
        {"expected_version": 0, "expected_invitation_version": 1},
        {"expected_version": True, "expected_invitation_version": 1},
        {"expected_version": 1, "expected_invitation_version": 1, "status": "OPEN"},
    ):
        with pytest.raises(ValidationError):
            Accept(**invalid)
    for price in ("1e3", "NaN", "0", "1.001"):
        with pytest.raises(ValidationError):
            Terms(
                expected_version=1,
                agreed_price_inr=price,
                payment_terms_text="Demo",
                possession_terms_text="Demo",
            )


def test_accept_keeps_rival_pending_and_blocks_second_buyer(world):
    db, seller, _, _, _, _, parcel, _, invitations = world
    tx = accept(world)
    assert parcel.status == "LOCKED" and parcel.active_transaction_id == tx.id
    assert invitations[0].status == "ACCEPTED" and invitations[1].status == "PENDING"
    with pytest.raises(ApiError) as error:
        flow.accept_invitation(
            db,
            seller,
            invitations[1].id,
            {"expected_version": parcel.version, "expected_invitation_version": 1},
        )
    assert error.value.code == "PARCEL_NOT_AVAILABLE"
    db.rollback()
    assert db.scalar(select(Transaction).where(Transaction.closed_at.is_(None))).id == tx.id


def test_accept_rechecks_buyer_identity(world):
    db, seller, buyer, _, _, _, parcel, _, invitations = world
    buyer.identity_status = "FAILED"
    db.commit()
    with pytest.raises(ApiError) as error:
        flow.accept_invitation(
            db,
            seller,
            invitations[0].id,
            {"expected_version": parcel.version, "expected_invitation_version": 1},
        )
    assert error.value.code == "IDENTITY_NOT_CONFIRMED"
    db.rollback()
    assert parcel.status == "OPEN" and invitations[0].status == "PENDING"


def test_current_proceed_responses_and_terms_invalidate_confirmations(world):
    db, seller, buyer, _, _, _, _, _, _ = world
    tx = accept(world)
    flow.record_outcome(db, seller, tx.id, claims(tx.version, choice="PROCEED"))
    db.commit()
    assert tx.status == "DISCUSSION"
    flow.record_outcome(db, seller, tx.id, claims(tx.version, choice="CONTINUE"))
    db.commit()
    flow.record_outcome(db, buyer, tx.id, claims(tx.version, choice="PROCEED"))
    db.commit()
    assert tx.status == "DISCUSSION"
    flow.record_outcome(db, seller, tx.id, claims(tx.version, choice="PROCEED"))
    db.commit()
    assert tx.status == "AGREEMENT_PREPARATION" and len(tx.outcomes["_history"]) == 4
    tx.confirmed_by = [seller.id, buyer.id]
    tx.draft_hash = "b" * 64
    db.commit()
    flow.set_terms(
        db,
        seller,
        tx.id,
        {
            "expected_version": tx.version,
            "agreed_price_inr": "500.00",
            "payment_terms_text": "No actual payment",
            "possession_terms_text": "Demo",
        },
    )
    db.commit()
    assert tx.confirmed_by == [] and tx.draft_hash is None and tx.terms["version"] == 1


def test_early_release_requires_agreement_and_explicit_republish(world):
    db, seller, buyer, _, reviewer, _, parcel, listing, invitations = world
    tx = accept(world)
    flow.request_cancellation(db, seller, tx.id, claims(tx.version))
    db.commit()
    case = db.get(CancellationCase, tx.cancellation_case_id)
    review = {
        "expected_version": case.version,
        "expected_transaction_version": tx.version,
        "decision": "RELEASE",
        "reason": "Early discussion; no obligations",
        "evidence_document_ids": [],
    }
    with pytest.raises(ApiError) as error:
        flow.review_cancellation(db, reviewer, case.id, review)
    assert error.value.code == "COMMITMENT_UNRESOLVED"
    db.rollback()
    flow.respond_cancellation(db, buyer, case.id, claims(tx.version, decision="AGREE"))
    db.commit()
    review.update(expected_version=case.version, expected_transaction_version=tx.version)
    flow.review_cancellation(db, reviewer, case.id, review)
    db.commit()
    assert tx.status == "CLOSED_CANCELLED" and tx.closed_at is not None
    assert case.status == "CLOSED_RELEASED" and case.official_check_id
    assert parcel.status == "OPEN" and parcel.active_transaction_id is None
    assert listing.status == "APPROVED" and invitations[1].status == "PENDING"


def test_disagreement_holds_and_external_transfer_cannot_resume(world):
    db, seller, buyer, _, reviewer, _, parcel, _, _ = world
    tx = accept(world)
    flow.request_cancellation(db, seller, tx.id, claims(tx.version))
    db.commit()
    case = db.get(CancellationCase, tx.cancellation_case_id)
    flow.respond_cancellation(db, buyer, case.id, claims(tx.version, decision="DISAGREE"))
    db.commit()
    hold = db.get(HoldCase, tx.hold_case_id)
    assert tx.status == "HOLD" and tx.resume_state == "CANCELLATION_PENDING" and parcel.status == "HOLD"
    flow.submit_hold_evidence(
        db,
        buyer,
        hold.id,
        {
            "expected_version": tx.version,
            "expected_case_version": hold.version,
            "statement": "Synthetic clarification",
            "evidence_document_ids": [],
        },
    )
    db.commit()
    assert tx.resume_state == "CANCELLATION_PENDING"
    parcel.status = "TRANSFERRED"
    parcel.official_status = "TRANSFER_RECORDED"
    db.commit()
    with pytest.raises(ApiError) as error:
        flow.review_hold(
            db,
            reviewer,
            hold.id,
            {
                "expected_version": hold.version,
                "expected_transaction_version": tx.version,
                "decision": "RESUME",
                "reason": "No override",
                "evidence_document_ids": [],
            },
        )
    assert error.value.code == "PARCEL_NOT_AVAILABLE"
    db.rollback()
    assert parcel.status == "TRANSFERRED" and tx.status == "HOLD"


def test_private_report_denies_unrelated_buyer(world):
    db, seller, _, rival, _, _, _, _, _ = world
    tx = accept(world)
    with pytest.raises(ApiError) as error:
        flow.report(db, tx, rival)
    assert error.value.status == 404
    report = flow.report(db, tx, seller)
    assert set(report) == {
        "transaction_id",
        "generated_at",
        "integration_mode",
        "checked_sources",
        "findings",
        "unresolved_items",
        "status_history",
        "registration_reference",
    }
    assert all(entry["reason"] is None for entry in report["status_history"])
