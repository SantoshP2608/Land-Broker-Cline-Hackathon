"""Real PostgreSQL integration fixtures; no SQLite or demo database resets.

Environment is configured before any app import. Every integration test rebuilds
the model schema in the isolated *_test database. Run these tests serially (not
pytest-xdist); the concurrency tests themselves use separate real connections.
"""

import os
import re
import shutil
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.engine import make_url

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.environ["DATABASE_URL"] = "postgresql+psycopg://land_demo@127.0.0.1:55432/land_demo_test"
os.environ["STORAGE_PATH"] = str(BACKEND_ROOT.parent / ".test-storage")
os.environ["APP_ENV"] = "test"
os.environ["OFFICIAL_INTEGRATION_MODE"] = "SIMULATED"
os.environ["DOCUMENT_EXTRACTION_BACKEND"] = "SIMULATED"

from fastapi.testclient import TestClient  # noqa: E402

from app.api.auth import SessionOutput, rate_limiter  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.schemas import Envelope, response_type  # noqa: E402
from scripts.seed_demo import DEMO_PASSWORD, seed  # noqa: E402

API = "/api/v1"


def assert_test_database() -> None:
    url = make_url(settings.database_url)
    if url.get_backend_name() != "postgresql" or not (url.database or "").endswith("_test"):
        raise RuntimeError("Refusing schema reset: a PostgreSQL database ending in _test is required.")
    if engine.url != url:
        raise RuntimeError("App engine was imported before the isolated test environment was configured.")
    if settings.storage_path.resolve() != Path(os.environ["STORAGE_PATH"]).resolve():
        raise RuntimeError("Refusing storage reset outside the explicit isolated test storage path.")


@pytest.fixture
def world():
    assert_test_database()
    # Reset only cross-test in-memory state; each test still exercises the real limiter.
    with rate_limiter._lock:
        rate_limiter._attempts.clear()
    engine.dispose()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    if settings.storage_path.exists():
        shutil.rmtree(settings.storage_path)
    settings.storage_path.mkdir(parents=True)
    with SessionLocal() as db:
        ids = seed(db)
        db.commit()
    yield ids
    engine.dispose()
    Base.metadata.drop_all(engine)
    if settings.storage_path.exists():
        shutil.rmtree(settings.storage_path)


class Actor:
    def __init__(self, email: str):
        self.client = TestClient(app)
        response = self.client.post(API + "/auth/login", json={"email": email, "password": DEMO_PASSWORD})
        assert response.status_code == 200, response.text
        SessionOutput.model_validate(response.json())
        session = response.json()["data"]
        self.id = session["user"]["id"]
        self.csrf = session["csrf_token"]
        assert "HttpOnly" in response.headers["set-cookie"]
        assert self.client.cookies.get("land_session")

    def close(self):
        self.client.close()

    def read(self, path: str):
        response = self.client.get(API + path)
        return data(response, 200)

    def command(self, path: str, payload: dict, *, status: int = 200, key: str | None = None):
        response = self.raw(path, payload, key=key)
        return data(response, status)

    def raw(self, path: str, payload: dict, *, key: str | None = None):
        return self.client.post(
            API + path,
            json=payload,
            headers={"X-CSRF-Token": self.csrf, "Idempotency-Key": key or str(uuid4())},
        )

    def upload(self, owner_kind, owner_id, document_type, content, *, version=None):
        fields = {
            "owner_kind": owner_kind,
            "owner_id": owner_id,
            "document_type": document_type,
            "sharing_scope": "OWNER_AND_OFFICERS",
        }
        if version is not None:
            fields["expected_version"] = str(version)
        response = self.client.post(
            API + "/documents",
            data=fields,
            files={"file": ("synthetic-evidence.pdf", content, "application/pdf")},
            headers={"X-CSRF-Token": self.csrf, "Idempotency-Key": str(uuid4())},
        )
        return data(response, 201)


def data(response, status: int = 200):
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"data", "meta"}
    assert body["meta"]["contract_version"] == "0.1"
    assert body["meta"]["request_id"]
    # JSONResponse command paths bypass FastAPI's automatic response validation.
    path = response.request.url.path
    template = next(
        template
        for template, methods in app.openapi()["paths"].items()
        if response.request.method.lower() in methods
        and re.fullmatch(re.sub(r"\{[^}]+\}", "[^/]+", template), path)
    )
    model = response_type(template.removeprefix(API), response.request.method)
    assert model is not None, f"Missing schema for {template}"
    Envelope[model].model_validate(body)
    return body["data"]


def error(response, status: int, code: str):
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error", "meta"}
    assert body["error"]["code"] == code
    assert body["meta"]["contract_version"] == "0.1"
    assert isinstance(body["error"]["field_errors"], dict)
    assert isinstance(body["error"]["retryable"], bool)


@pytest.fixture
def actors(world):
    people = {
        name: Actor(email)
        for name, email in {
            "seller": "seller@demo.local",
            "buyer_a": "buyer.a@demo.local",
            "buyer_b": "buyer.b@demo.local",
            "outsider": "outsider@demo.local",
            "reviewer": "reviewer@demo.local",
            "registrar": "registrar@demo.local",
        }.items()
    }
    yield people
    for actor in people.values():
        actor.close()


def accept(actors, world, *, listing_number: int = 1, buyer: str = "buyer_a"):
    seller = actors["seller"]
    listing_id = world[f"listing_{listing_number}"]
    if listing_number == 1:
        invitation = next(
            item
            for item in seller.read(f"/seller/listings/{listing_id}/invitations")["items"]
            if item["buyer_id"] == actors[buyer].id
        )
    else:
        invitation = actors[buyer].command(
            f"/listings/{listing_id}/invitations", {"message": "Synthetic integration narrative"}, status=201
        )
    listing = seller.read(f"/seller/listings/{listing_id}")
    result = seller.command(
        f"/invitations/{invitation['id']}/accept",
        {
            "expected_version": listing["parcel"]["version"],
            "expected_invitation_version": invitation["version"],
        },
        status=201,
    )
    assert result["transaction"]["status"] == "DISCUSSION"
    assert result["transaction"]["buyer_id"] == actors[buyer].id
    return result["transaction"]


def prepare(actors, tx):
    for role in ("seller", "buyer_a"):
        tx = actors[role].command(
            f"/transactions/{tx['id']}/outcomes",
            {
                "expected_version": tx["version"],
                "choice": "PROCEED",
                "reason": "Synthetic agreement discussion",
                "claimed_commitments": False,
                "evidence_document_ids": [],
            },
        )["transaction"]
    assert tx["status"] == "AGREEMENT_PREPARATION"
    return actors["seller"].command(
        f"/transactions/{tx['id']}/terms",
        {
            "expected_version": tx["version"],
            "agreed_price_inr": "2500000.00",
            "payment_terms_text": "SIMULATED; no real money changes hands.",
            "possession_terms_text": "SIMULATED; no real possession transfer.",
        },
    )


def generate_and_confirm(actors, tx):
    result = actors["seller"].command(
        f"/transactions/{tx['id']}/deed", {"expected_version": tx["version"]}, status=201
    )
    tx = result["transaction"]
    assert tx["draft_document_id"] == result["document"]["id"]
    assert tx["draft_hash"] == result["document"]["sha256"]
    for role in ("seller", "buyer_a"):
        tx = actors[role].command(
            f"/transactions/{tx['id']}/deed-confirmations",
            {"expected_version": tx["version"], "draft_hash": tx["draft_hash"]},
        )
    assert set(tx["confirmed_by"]) == {actors["seller"].id, actors["buyer_a"].id}
    return tx
