"""Authorization, command fencing, and authenticated official-event boundaries."""

import hashlib
import hmac
import io
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from conftest import API, accept, data, error, generate_and_confirm, prepare
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import func, select

from app.core.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import HoldCase, Idempotency, Parcel, RegistrationEvent, Transaction


def signed_event(client, payload, *, timestamp=None, signature=None):
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    timestamp = timestamp or datetime.now(UTC).isoformat()
    signature = (
        signature
        or hmac.new(
            settings.simulator_secret.encode(), timestamp.encode() + b"." + raw, hashlib.sha256
        ).hexdigest()
    )
    return client.post(
        API + "/integrations/registration/events",
        content=raw,
        headers={
            "Content-Type": "application/json",
            "X-Event-ID": payload["event_id"],
            "X-Event-Timestamp": timestamp,
            "X-Event-Signature": signature,
        },
    )


def event_payload(**overrides):
    return {
        "event_id": str(uuid4()),
        "provider": "DEMO_REGISTRY",
        "mode": "SIMULATED",
        "event_type": "REGISTRATION_COMPLETED",
        "provider_parcel_ref": "DEMO/PARCEL/001",
        "authority_revision": 2,
        "registration_reference": "DEMO-REG-SIGNED-001",
        "seller_subject_ref": "DEMO-SELLER-001",
        "buyer_subject_ref": "DEMO-BUYER-001",
        "whole_parcel": True,
        "registered_at": datetime.now(UTC).isoformat(),
        "evidence_reference": "DEMO-REGISTERED-DEED-001",
        **overrides,
    }


@pytest.mark.parametrize("token", [None, "not-the-session-token"])
def test_missing_or_invalid_csrf_denied_before_mutation(world, actors, token):
    buyer = actors["buyer_a"]
    headers = {"Idempotency-Key": str(uuid4())}
    if token is not None:
        headers["X-CSRF-Token"] = token
    response = buyer.client.post(
        API + f"/listings/{world['listing_2']}/invitations", json={"message": "Blocked"}, headers=headers
    )
    error(response, 403, "FORBIDDEN")
    assert actors["seller"].read(f"/seller/listings/{world['listing_2']}/invitations")["items"] == []


def test_foreign_session_csrf_and_hostile_origin_denied(world, actors):
    buyer = actors["buyer_a"]
    path = API + f"/listings/{world['listing_2']}/invitations"
    error(
        buyer.client.post(
            path,
            json={"message": "Blocked"},
            headers={"Idempotency-Key": str(uuid4()), "X-CSRF-Token": actors["seller"].csrf},
        ),
        403,
        "FORBIDDEN",
    )
    error(
        buyer.client.post(
            path,
            json={"message": "Blocked"},
            headers={
                "Idempotency-Key": str(uuid4()),
                "X-CSRF-Token": buyer.csrf,
                "Origin": "https://unrelated.invalid",
            },
        ),
        403,
        "FORBIDDEN",
    )


@pytest.mark.parametrize(
    "forged",
    [
        {"status": "COMPLETED"},
        {"roles": ["REGISTRAR"]},
        {"owner_id": "00000000-0000-4000-8000-000000000002"},
        {"allowed_actions": ["ACCEPT_INVITATION"]},
    ],
)
def test_unknown_business_fields_rejected(world, actors, forged):
    response = actors["buyer_a"].raw(
        f"/listings/{world['listing_2']}/invitations", {"message": "No mass assignment", **forged}
    )
    error(response, 422, "VALIDATION_ERROR")


def test_idempotency_exact_retry_replays_and_changed_payload_conflicts(world, actors):
    buyer = actors["buyer_a"]
    path = f"/listings/{world['listing_2']}/invitations"
    key = str(uuid4())
    payload = {"message": "One synthetic invitation"}
    first = buyer.raw(path, payload, key=key)
    data(first, 201)
    replay = buyer.raw(path, payload, key=key)
    data(replay, 201)
    assert replay.json() == first.json()
    error(buyer.raw(path, {"message": "Different payload"}, key=key), 409, "IDEMPOTENCY_CONFLICT")
    assert len(actors["seller"].read(f"/seller/listings/{world['listing_2']}/invitations")["items"]) == 1


def test_unrelated_private_documents_transactions_and_bound_download_denied(world, actors):
    seller, outsider = actors["seller"], actors["outsider"]
    listing = seller.read(f"/seller/listings/{world['listing_1']}")
    document_id = listing["document_ids"][0]
    for path in (
        f"/seller/listings/{world['listing_1']}",
        f"/documents/{document_id}",
        f"/documents/{document_id}/download",
    ):
        error(outsider.client.get(API + path), 404, "NOT_FOUND")
    token = seller.read(f"/documents/{document_id}/download")["download_url"]
    response = seller.client.get(token)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    text = PdfReader(io.BytesIO(response.content)).pages[0].extract_text()
    assert "Survey: 001" in text
    assert "Area sqm: 1200.00" in text
    assert "Owner subject: DEMO-SELLER-001" in text
    error(outsider.client.get(token), 404, "NOT_FOUND")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    error(seller.client.get(tampered), 404, "NOT_FOUND")
    with TestClient(app) as anonymous:
        error(anonymous.get(token), 401, "AUTH_REQUIRED")
    tx = accept(actors, world)
    for suffix in ("", "/timeline", "/report", "/report/download"):
        error(outsider.client.get(API + f"/transactions/{tx['id']}{suffix}"), 404, "NOT_FOUND")
    report_token = seller.read(f"/transactions/{tx['id']}/report/download")["download_url"]
    error(outsider.client.get(report_token), 404, "NOT_FOUND")
    report = seller.client.get(report_token)
    assert report.status_code == 200, report.text
    assert report.headers["content-type"] == "text/plain; charset=utf-8"
    exported = json.loads(report.content)
    assert exported["transaction_id"] == tx["id"]
    assert exported["integration_mode"] == "SIMULATED"
    assert exported["status_history"]
    public = outsider.read(f"/listings/{world['listing_1']}")
    assert "document_ids" not in public
    assert "seller_id" not in public
    assert "parcel" not in public


def test_stale_expected_version_does_not_mutate_transaction(world, actors):
    tx = accept(actors, world)
    seller = actors["seller"]
    old_version = tx["version"]
    result = seller.command(
        f"/transactions/{tx['id']}/outcomes",
        {"expected_version": old_version, "choice": "CONTINUE", "reason": "Still discussing"},
    )
    assert result["transaction"]["version"] == old_version + 1
    error(
        actors["buyer_a"].raw(
            f"/transactions/{tx['id']}/outcomes",
            {"expected_version": old_version, "choice": "PROCEED", "reason": "Stale"},
        ),
        409,
        "VERSION_CONFLICT",
    )
    latest = seller.read(f"/transactions/{tx['id']}")
    assert latest["version"] == old_version + 1
    assert latest["status"] == "DISCUSSION"


def test_terms_change_invalidates_deed_hash_and_both_confirmations(world, actors):
    tx = generate_and_confirm(actors, prepare(actors, accept(actors, world)))
    previous_hash = tx["draft_hash"]
    updated = actors["seller"].command(
        f"/transactions/{tx['id']}/terms",
        {
            "expected_version": tx["version"],
            "agreed_price_inr": "2400000.00",
            "payment_terms_text": "Changed synthetic terms",
            "possession_terms_text": "Still simulated",
        },
    )
    assert updated["draft_hash"] is None
    assert updated["draft_document_id"] is None
    assert updated["confirmed_by"] == []
    error(
        actors["buyer_a"].raw(
            f"/transactions/{tx['id']}/registration-submit",
            {"expected_version": updated["version"], "draft_hash": previous_hash},
        ),
        409,
        "VERSION_CONFLICT",
    )
    result = actors["seller"].command(
        f"/transactions/{tx['id']}/deed", {"expected_version": updated["version"]}, status=201
    )
    new_tx = result["transaction"]
    assert new_tx["draft_hash"] != previous_hash
    error(
        actors["seller"].raw(
            f"/transactions/{tx['id']}/registration-submit",
            {"expected_version": new_tx["version"], "draft_hash": new_tx["draft_hash"]},
        ),
        409,
        "DEED_CONFIRMATIONS_REQUIRED",
    )


def test_signed_events_apply_replay_changed_id_conflict_and_older_revision(world, actors):
    tx = generate_and_confirm(actors, prepare(actors, accept(actors, world)))
    tx = actors["buyer_a"].command(
        f"/transactions/{tx['id']}/registration-submit",
        {"expected_version": tx["version"], "draft_hash": tx["draft_hash"]},
    )
    payload = event_payload()
    with TestClient(app) as integration:
        assert data(signed_event(integration, payload))["processing_result"] == "APPLIED"
        assert data(signed_event(integration, payload))["processing_result"] == "ALREADY_PROCESSED"
        error(
            signed_event(integration, {**payload, "evidence_reference": "different body"}),
            409,
            "IDEMPOTENCY_CONFLICT",
        )
        older = event_payload(authority_revision=1)
        assert data(signed_event(integration, older))["processing_result"] == "ALREADY_PROCESSED"
    with SessionLocal() as db:
        parcel = db.get(Parcel, world["parcel_1"])
        assert parcel.authority_revision == 2
        assert parcel.status == "TRANSFERRED"
        assert parcel.owner_id == world["buyer_a"]
        assert db.get(Transaction, tx["id"]).status == "COMPLETED"
        assert db.scalar(select(func.count()).select_from(RegistrationEvent)) == 2


@pytest.mark.parametrize(
    "overrides,reason",
    [
        ({"authority_revision": 1}, "CONFLICTING_REVISION"),
        ({"whole_parcel": False}, "PARTIAL_UNMAPPED_OR_REVISION_GAP"),
        ({"authority_revision": 3}, "PARTIAL_UNMAPPED_OR_REVISION_GAP"),
    ],
)
def test_signed_conflicting_partial_or_gap_events_quarantined_keep_lock(world, actors, overrides, reason):
    tx = accept(actors, world)
    with TestClient(app) as integration:
        result = data(signed_event(integration, event_payload(**overrides)))
    assert result["processing_result"] == "QUARANTINED"
    with SessionLocal() as db:
        parcel = db.get(Parcel, world["parcel_1"])
        stored_tx = db.get(Transaction, tx["id"])
        assert parcel.status == "HOLD"
        assert parcel.active_transaction_id == tx["id"]
        assert parcel.owner_id == world["seller"]
        assert stored_tx.status == "HOLD"
        assert db.get(HoldCase, stored_tx.hold_case_id).reason_code == reason
    error(
        actors["buyer_b"].raw(f"/listings/{world['listing_1']}/invitations", {"message": "Must not reopen"}),
        409,
        "PARCEL_NOT_AVAILABLE",
    )


def test_unsigned_and_expired_official_events_rejected(world):
    with TestClient(app) as integration:
        error(signed_event(integration, event_payload(), signature="0" * 64), 403, "FORBIDDEN")
        error(
            signed_event(
                integration, event_payload(), timestamp=(datetime.now(UTC) - timedelta(minutes=6)).isoformat()
            ),
            403,
            "FORBIDDEN",
        )
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(RegistrationEvent)) == 0
        assert db.get(Parcel, world["parcel_1"]).status == "OPEN"


def test_transient_registry_failure_preserves_lock_and_same_key_resumes(world, actors):
    tx = accept(actors, world)
    result = actors["buyer_a"].command(
        f"/transactions/{tx['id']}/cancellation",
        {"expected_version": tx["version"], "reason": "Early synthetic withdrawal"},
        status=201,
    )
    tx, case = result["transaction"], result["cancellation_case"]
    result = actors["seller"].command(
        f"/cancellations/{case['id']}/response",
        {"expected_version": tx["version"], "decision": "AGREE", "reason": "No commitments"},
    )
    tx, case = result["transaction"], result["cancellation_case"]
    path = f"/reviews/cancellations/{case['id']}/decision"
    key = str(uuid4())
    payload = {
        "expected_version": case["version"],
        "expected_transaction_version": tx["version"],
        "decision": "RELEASE",
        "reason": "Reviewed early release",
    }
    with SessionLocal() as db:
        db.get(Parcel, world["parcel_1"]).official_available = False
        db.commit()
    response = actors["reviewer"].raw(path, payload, key=key)
    error(response, 503, "OFFICIAL_STATUS_UNKNOWN")
    assert response.json()["error"]["retryable"] is True
    with SessionLocal() as db:
        parcel = db.get(Parcel, world["parcel_1"])
        assert parcel.active_transaction_id == tx["id"]
        assert parcel.status == "LOCKED"
        assert db.get(Transaction, tx["id"]).version == tx["version"]
        record = db.scalar(select(Idempotency).where(Idempotency.key == key))
        assert record is not None
        assert record.response_body is None
        parcel.official_available = True
        db.commit()
    error(
        actors["reviewer"].raw(path, {**payload, "reason": "Changed retry"}, key=key),
        409,
        "IDEMPOTENCY_CONFLICT",
    )
    resumed = actors["reviewer"].raw(path, payload, key=key)
    result = data(resumed)
    assert result["transaction"]["status"] == "CLOSED_CANCELLED"
    assert result["parcel"]["status"] == "OPEN"
    assert actors["reviewer"].raw(path, payload, key=key).json() == resumed.json()
