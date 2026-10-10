"""Concurrent HTTP commands and independent PostgreSQL sessions, not SQLite mocks."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from conftest import Actor, accept, data, error
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from test_security import event_payload, signed_event

from app.db import SessionLocal
from app.main import app
from app.models import Idempotency, Invitation, Listing, Parcel, Transaction


def race(*commands):
    barrier = Barrier(len(commands))

    def run(fn):
        barrier.wait(timeout=10)
        return fn()

    with ThreadPoolExecutor(max_workers=len(commands)) as pool:
        futures = [pool.submit(run, command) for command in commands]
        return [future.result(timeout=30) for future in futures]


def test_acceptance_a_b_race_has_exactly_one_active_transaction(world, actors):
    # Independent browser sessions have independent DB sessions for each request.
    seller_a, seller_b = Actor("seller@demo.local"), Actor("seller@demo.local")
    payload = {"expected_version": 1, "expected_invitation_version": 1}
    try:
        responses = race(
            lambda: seller_a.raw(f"/invitations/{world['invitation_buyer_a']}/accept", payload),
            lambda: seller_b.raw(f"/invitations/{world['invitation_buyer_b']}/accept", payload),
        )
    finally:
        seller_a.close()
        seller_b.close()
    assert sorted(response.status_code for response in responses) == [201, 409]
    winner = next(response for response in responses if response.status_code == 201)
    loser = next(response for response in responses if response.status_code == 409)
    tx = data(winner, 201)["transaction"]
    error(loser, 409, "VERSION_CONFLICT")
    with SessionLocal() as db:
        active = db.scalars(
            select(Transaction).where(
                Transaction.parcel_id == world["parcel_1"], Transaction.closed_at.is_(None)
            )
        ).all()
        assert len(active) == 1
        assert active[0].id == tx["id"]
        assert db.get(Parcel, world["parcel_1"]).active_transaction_id == tx["id"]
        assert db.get(Parcel, world["parcel_1"]).status == "LOCKED"
        statuses = db.scalars(
            select(Invitation.status).where(Invitation.listing_id == world["listing_1"])
        ).all()
        assert sorted(statuses) == ["ACCEPTED", "PENDING"]


def test_same_idempotency_key_concurrent_acceptance_replays_one_commit(world):
    first, second = Actor("seller@demo.local"), Actor("seller@demo.local")
    key = str(uuid4())
    path = f"/invitations/{world['invitation_buyer_a']}/accept"
    payload = {"expected_version": 1, "expected_invitation_version": 1}
    try:
        responses = race(
            lambda: first.raw(path, payload, key=key), lambda: second.raw(path, payload, key=key)
        )
    finally:
        first.close()
        second.close()
    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()
    tx = data(responses[0], 201)["transaction"]
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Transaction)) == 1
        assert db.scalar(select(func.count()).select_from(Idempotency).where(Idempotency.key == key)) == 1
        assert db.get(Parcel, world["parcel_1"]).active_transaction_id == tx["id"]
        assert db.get(Invitation, world["invitation_buyer_a"]).version == 2


def test_release_and_signed_completion_race_never_reopens_transferred_land(world, actors):
    tx = accept(actors, world)
    result = actors["buyer_a"].command(
        f"/transactions/{tx['id']}/cancellation",
        {"expected_version": tx["version"], "reason": "Synthetic early cancellation"},
        status=201,
    )
    tx, case = result["transaction"], result["cancellation_case"]
    result = actors["seller"].command(
        f"/cancellations/{case['id']}/response",
        {"expected_version": tx["version"], "decision": "AGREE", "reason": "No commitments"},
    )
    tx, case = result["transaction"], result["cancellation_case"]
    payload = {
        "expected_version": case["version"],
        "expected_transaction_version": tx["version"],
        "decision": "RELEASE",
        "reason": "Reviewed current synthetic availability",
    }
    with TestClient(app) as integration:
        release, official = race(
            lambda: actors["reviewer"].raw(f"/reviews/cancellations/{case['id']}/decision", payload),
            lambda: signed_event(integration, event_payload()),
        )
    assert data(official)["processing_result"] == "APPLIED"
    # Two valid serial orders. Check the exact result required by each order,
    # rather than accepting alternate statuses for the same business outcome.
    if release.status_code == 200:
        assert data(release)["transaction"]["status"] == "CLOSED_CANCELLED"
        terminal_status = "CLOSED_CANCELLED"
    else:
        error(release, 409, "INVALID_TRANSITION")
        terminal_status = "COMPLETED"
    with SessionLocal() as db:
        parcel = db.get(Parcel, world["parcel_1"])
        assert parcel.status == "TRANSFERRED"
        assert parcel.official_status == "TRANSFER_RECORDED"
        assert parcel.owner_id == world["buyer_a"]
        assert parcel.active_transaction_id is None
        assert db.get(Listing, world["listing_1"]).status == "CLOSED"
        assert db.get(Transaction, tx["id"]).status == terminal_status
        assert (
            db.scalar(select(func.count()).select_from(Transaction).where(Transaction.closed_at.is_(None)))
            == 0
        )
    error(
        actors["buyer_b"].raw(f"/listings/{world['listing_1']}/invitations", {"message": "Never reopen"}),
        409,
        "PARCEL_NOT_AVAILABLE",
    )
