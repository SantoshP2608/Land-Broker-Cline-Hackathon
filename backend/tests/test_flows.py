"""Strict API narratives executed against isolated PostgreSQL and real PDF bytes."""

import io

from conftest import API, Actor, accept, error, generate_and_confirm, prepare
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import func, select

from app.db import SessionLocal
from app.main import app
from app.models import Base, Listing, Parcel, Transaction
from app.services.documents import synthetic_pdf
from app.services.verification import process_jobs
from scripts.seed_demo import demo_location, seed


def test_seed_is_idempotent_and_preserves_existing_workflow(world, actors):
    with SessionLocal() as db:
        before = {
            name: db.scalar(select(func.count()).select_from(table))
            for name, table in Base.metadata.tables.items()
        }
        assert seed(db) == world
        db.commit()
        after = {
            name: db.scalar(select(func.count()).select_from(table))
            for name, table in Base.metadata.tables.items()
        }
        assert before == after
    tx = accept(actors, world)
    with SessionLocal() as db:
        seed(db)
        db.commit()
        assert db.get(Parcel, world["parcel_1"]).active_transaction_id == tx["id"]
        assert db.get(Transaction, tx["id"]).status == "DISCUSSION"
    listings = actors["buyer_b"].read("/listings")["items"]
    assert len(listings) == 3
    assert [item["availability"] for item in listings] == ["RESERVED", "AVAILABLE", "AVAILABLE"]


def test_success_real_deed_both_confirmations_simulated_transfer_no_reopen(world, actors):
    tx = generate_and_confirm(actors, prepare(actors, accept(actors, world)))
    buyer = actors["buyer_a"]
    download = buyer.read(f"/documents/{tx['draft_document_id']}/download")
    response = buyer.client.get(download["download_url"])
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    text = "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(response.content)).pages)
    assert "SIMULATED" in text
    assert "2500000.00" in text
    tx = buyer.command(
        f"/transactions/{tx['id']}/registration-submit",
        {"expected_version": tx["version"], "draft_hash": tx["draft_hash"]},
    )
    assert tx["status"] == "REGISTRATION_PENDING"
    result = actors["registrar"].command(
        "/registrations/simulate",
        {
            "transaction_id": tx["id"],
            "expected_version": tx["version"],
            "registration_reference": "DEMO-REG-INTEGRATION-001",
        },
    )
    assert result["processing_result"] == "APPLIED"
    assert result["transaction"]["status"] == "COMPLETED"
    assert result["transaction"]["closed_at"].endswith("Z")
    listing = buyer.read(f"/listings/{world['listing_1']}")
    assert listing["status"] == "CLOSED"
    assert listing["availability"] == "TRANSFERRED"
    assert "SEND_INVITATION" not in listing["allowed_actions"]
    error(
        actors["buyer_b"].raw(f"/listings/{world['listing_1']}/invitations", {"message": "No reopen"}),
        409,
        "PARCEL_NOT_AVAILABLE",
    )
    with SessionLocal() as db:
        parcel = db.get(Parcel, world["parcel_1"])
        assert parcel.owner_id == world["buyer_a"]
        assert parcel.status == "TRANSFERRED"
        assert parcel.active_transaction_id is None
        seed(db)
        db.commit()
        assert db.get(Listing, world["listing_1"]).status == "CLOSED"
        assert db.get(Parcel, world["parcel_1"]).owner_id == world["buyer_a"]


def test_early_cancellation_reviewer_release_explicit_republish_then_buyer_b(world, actors):
    tx = accept(actors, world, listing_number=2)
    cancellation = actors["buyer_a"].command(
        f"/transactions/{tx['id']}/cancellation",
        {
            "expected_version": tx["version"],
            "reason": "Early synthetic withdrawal",
            "claimed_commitments": False,
            "evidence_document_ids": [],
        },
        status=201,
    )
    tx, case = cancellation["transaction"], cancellation["cancellation_case"]
    assert tx["status"] == "CANCELLATION_PENDING"
    assert actors["buyer_b"].read(f"/listings/{world['listing_2']}")["availability"] == "CANCELLATION_PENDING"
    response = actors["seller"].command(
        f"/cancellations/{case['id']}/response",
        {
            "expected_version": tx["version"],
            "decision": "AGREE",
            "reason": "No synthetic commitments",
            "claimed_commitments": False,
            "evidence_document_ids": [],
        },
    )
    tx, case = response["transaction"], response["cancellation_case"]
    result = actors["reviewer"].command(
        f"/reviews/cancellations/{case['id']}/decision",
        {
            "expected_version": case["version"],
            "expected_transaction_version": tx["version"],
            "decision": "RELEASE",
            "reason": "Reviewed consent and current simulated official source",
            "evidence_document_ids": [],
        },
    )
    assert result["transaction"]["status"] == "CLOSED_CANCELLED"
    assert result["cancellation_case"]["status"] == "CLOSED_RELEASED"
    assert result["parcel"]["status"] == "OPEN"
    listing = actors["seller"].read(f"/seller/listings/{world['listing_2']}")
    assert listing["status"] == "APPROVED"
    assert listing["availability"] == "UNCONFIRMED"
    error(
        actors["buyer_b"].raw(f"/listings/{world['listing_2']}/invitations", {"message": "Before republish"}),
        404,
        "NOT_FOUND",
    )
    listing = actors["seller"].command(
        f"/seller/listings/{listing['id']}/publish", {"expected_version": listing["version"]}
    )
    assert listing["availability"] == "AVAILABLE"
    next_tx = accept(actors, world, listing_number=2, buyer="buyer_b")
    assert next_tx["id"] != tx["id"]
    assert next_tx["buyer_id"] == world["buyer_b"]


def test_disputed_cancellation_holds_parcel_and_reviewer_cannot_release(world, actors):
    tx = accept(actors, world, listing_number=3)
    result = actors["buyer_a"].command(
        f"/transactions/{tx['id']}/cancellation",
        {
            "expected_version": tx["version"],
            "reason": "Synthetic withdrawal",
            "claimed_commitments": False,
            "evidence_document_ids": [],
        },
        status=201,
    )
    tx, case = result["transaction"], result["cancellation_case"]
    result = actors["seller"].command(
        f"/cancellations/{case['id']}/response",
        {
            "expected_version": tx["version"],
            "decision": "DISAGREE",
            "reason": "Disputed synthetic deposit",
            "claimed_commitments": True,
            "evidence_document_ids": [],
        },
    )
    tx, case = result["transaction"], result["cancellation_case"]
    assert tx["status"] == "HOLD"
    assert case["status"] == "HOLD"
    assert tx["hold_case_id"]
    assert actors["buyer_b"].read(f"/listings/{world['listing_3']}")["availability"] == "ON_HOLD"
    error(
        actors["reviewer"].raw(
            f"/reviews/cancellations/{case['id']}/decision",
            {
                "expected_version": case["version"],
                "expected_transaction_version": tx["version"],
                "decision": "RELEASE",
                "reason": "Cannot erase dispute",
                "evidence_document_ids": [],
            },
        ),
        409,
        "COMMITMENT_UNRESOLVED",
    )
    error(
        actors["buyer_b"].raw(f"/listings/{world['listing_3']}/invitations", {"message": "Still held"}),
        409,
        "PARCEL_NOT_AVAILABLE",
    )
    with SessionLocal() as db:
        assert db.get(Parcel, world["parcel_3"]).active_transaction_id == tx["id"]
        assert db.get(Parcel, world["parcel_3"]).status == "HOLD"


def test_open_fourth_parcel_supports_listing_creation(world, actors):
    result = actors["seller"].command(
        "/seller/listings",
        {
            "title": "Synthetic new listing",
            "description": "No real land",
            "location": demo_location("004"),
            "original_area": "1200.00",
            "original_unit": "SQM",
            "land_type": "DEMO_LAND",
            "asking_price_inr": "2500000.00",
        },
        status=201,
    )
    assert result["status"] == "DRAFT"
    assert result["parcel"]["id"] == world["parcel_4"]
    assert result["availability"] == "UNCONFIRMED"


def test_real_upload_worker_review_publish_and_material_change_invalidation(world, actors):
    seller = actors["seller"]
    listing = seller.command(
        "/seller/listings",
        {
            "title": "Synthetic worker pipeline",
            "description": "No real land",
            "location": demo_location("004"),
            "original_area": "1200.00",
            "original_unit": "SQM",
            "land_type": "DEMO_LAND",
            "asking_price_inr": "2500000.00",
        },
        status=201,
    )
    content = synthetic_pdf(
        "Survey: 004\nArea sqm: 1200.00\nOwner subject: DEMO-SELLER-001\nSIMULATED DEMONSTRATION"
    )
    for document_type in ("PREVIOUS_DEED", "LAND_RECORD", "ENCUMBRANCE_CERTIFICATE"):
        uploaded = seller.upload("LISTING", listing["id"], document_type, content, version=listing["version"])
        listing["version"] = uploaded["owner"]["version"]
    submitted = seller.command(
        f"/seller/listings/{listing['id']}/submit-review",
        {"expected_version": listing["version"]},
        status=202,
    )
    listing, job = submitted["listing"], submitted["verification_job"]
    assert job["status"] == "QUEUED"
    with SessionLocal() as db:
        assert process_jobs(db) == [job["id"]]
    job = seller.read(f"/verification-jobs/{job['id']}")
    assert job["status"] == "COMPLETED"
    findings = seller.read(f"/seller/listings/{listing['id']}/findings")["items"]
    assert len(findings) == 9
    assert {finding["status"] for finding in findings} == {"MATCHES_SOURCE"}
    assert all(finding["left_evidence"]["page_number"] == 1 for finding in findings)
    assert all(finding["left_evidence"]["document_id"] for finding in findings)
    listing = actors["reviewer"].command(
        f"/reviews/listings/{listing['id']}/decision",
        {
            "expected_version": listing["version"],
            "decision": "APPROVE",
            "reason": "Current complete synthetic comparisons",
            "evidence_document_ids": [],
        },
    )
    assert listing["status"] == "APPROVED"
    listing = seller.command(
        f"/seller/listings/{listing['id']}/publish", {"expected_version": listing["version"]}
    )
    assert listing["availability"] == "AVAILABLE"
    changed = synthetic_pdf(
        "Survey: 004\nArea sqm: 999.00\nOwner subject: DEMO-SELLER-001\nSIMULATED DEMONSTRATION"
    )
    seller.upload("LISTING", listing["id"], "LAND_RECORD", changed, version=listing["version"])
    listing = seller.read(f"/seller/listings/{listing['id']}")
    assert listing["status"] == "CHANGES_REQUIRED"
    assert listing["availability"] == "UNCONFIRMED"
    with SessionLocal() as db:
        assert db.get(Listing, listing["id"]).approved_document_set_hash is None
    error(
        seller.raw(f"/seller/listings/{listing['id']}/publish", {"expected_version": listing["version"]}),
        409,
        "REVIEW_NOT_CURRENT",
    )
    submitted = seller.command(
        f"/seller/listings/{listing['id']}/submit-review",
        {"expected_version": listing["version"]},
        status=202,
    )
    # A material replacement after queuing must fence the old queued snapshot.
    seller.upload("LISTING", listing["id"], "LAND_RECORD", content, version=submitted["listing"]["version"])
    with SessionLocal() as db:
        assert process_jobs(db) == [submitted["verification_job"]["id"]]
    stale = seller.read(f"/verification-jobs/{submitted['verification_job']['id']}")
    assert stale["status"] == "FAILED"
    assert stale["error_message"]
    latest = seller.read(f"/seller/listings/{listing['id']}")
    assert latest["status"] == "CHANGES_REQUIRED"
    assert latest["availability"] == "UNCONFIRMED"


def test_new_identity_upload_consent_assigned_review_no_automatic_confirmation(world, actors):
    with TestClient(app) as client:
        response = client.post(
            API + "/auth/register",
            json={
                "display_name": "Synthetic New Citizen",
                "email": "new@demo.local",
                "password": "DemoPass123!",
            },
        )
        assert response.status_code == 201, response.text
        assert response.json()["data"]["identity_status"] == "PENDING"
    citizen = Actor("new@demo.local")
    try:
        doc = citizen.upload(
            "USER", citizen.id, "IDENTITY", synthetic_pdf("SIMULATED DEMONSTRATION identity evidence")
        )["document"]
        submission = citizen.command(
            "/identity/submissions", {"consent": True, "document_ids": [doc["id"]]}, status=201
        )
        assert submission["status"] == "PENDING"
        assert submission["mode"] == "SIMULATED"
        error(actors["outsider"].client.get(API + f"/documents/{doc['id']}"), 404, "NOT_FOUND")
        confirmed = actors["reviewer"].command(
            f"/reviews/identity/{submission['id']}/decision",
            {
                "expected_version": submission["version"],
                "decision": "CONFIRM",
                "reason": "Reviewed simulated identity evidence",
            },
        )
        assert confirmed["status"] == "CONFIRMED"
        assert confirmed["version"] == submission["version"] + 1
        session = citizen.client.get(API + "/auth/session")
        assert session.status_code == 200, session.text
        assert session.json()["data"]["user"]["identity_status"] == "CONFIRMED"
    finally:
        citizen.close()
