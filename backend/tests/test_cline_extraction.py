"""SDK bridge boundaries, strict provenance and job state isolation."""

from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest
from conftest import error

from app.core.config import Settings, settings
from app.db import SessionLocal
from app.models import Listing, VerificationJob
from app.schemas import FindingDTO
from app.services import cline_extraction as bridge
from app.services import verification
from app.services.documents import synthetic_pdf

TEXT = "SYNTHETIC DEMONSTRATION\nSurvey: 001\nArea sqm: 1200.00\nOwner subject: DEMO-SELLER-001\n"
SOURCE = {"survey_number": "001", "area_sqm": "1200.00", "owner_subject_ref": "DEMO-SELLER-001"}


def document():
    return {
        "id": str(uuid4()),
        "version": 1,
        "sha256": "a" * 64,
        "document_type": "LAND_RECORD",
        "pages": [TEXT],
    }


def response():
    return {
        "protocol_version": 1,
        "sdk_version": "0.0.92",
        "provider_id": "openai",
        "model_id": "test-model",
        "extraction": {
            "fields": [
                {
                    "field_name": name,
                    "raw_text": value,
                    "normalized_value": value,
                    "page_number": 1,
                    "confidence": "0.95",
                    "uncertainty_notes": [],
                }
                for name, value in SOURCE.items()
            ],
            "warnings": [],
        },
    }


@pytest.fixture
def sdk(monkeypatch):
    monkeypatch.setattr(settings, "document_extraction_backend", "CLINE_SDK")
    monkeypatch.setattr(settings, "cline_provider_id", "openai")
    monkeypatch.setattr(settings, "cline_model_id", "test-model")
    monkeypatch.setattr(settings, "cline_min_confidence", "0.80")


def test_sdk_is_default_and_blank_optional_values_are_safe():
    config = Settings(
        _env_file=None,
        document_extraction_backend="CLINE_SDK",
        cline_provider_id="",
        cline_api_key="",
        cline_model_id="",
        cline_base_url="",
    )
    assert config.document_extraction_backend == "CLINE_SDK"
    assert config.cline_provider_id is None and config.cline_api_key is None
    with pytest.raises(ValueError):
        Settings(_env_file=None, cline_min_confidence="NaN")


def test_actual_bridge_payload_and_sdk_findings_keep_contract(sdk, monkeypatch):
    seen = []

    def invoke(payload):
        seen.append(payload)
        return response()

    monkeypatch.setattr(bridge, "invoke_sdk", invoke)
    doc = document()
    findings = verification.extract_findings(str(uuid4()), {"LAND_RECORD": doc}, SOURCE)
    matches = [item for item in findings if item["left_evidence"]]
    assert len(matches) == 3
    assert {item["status"] for item in matches} == {"MATCHES_SOURCE"}
    for item in findings:
        FindingDTO.model_validate(item)
    payload = seen[0]
    assert payload["document"]["sha256"] == "a" * 64
    assert payload["pages"] == [{"page_number": 1, "text": TEXT}]
    assert "sources" not in payload and "database_url" not in str(payload)


@pytest.mark.parametrize(
    "mutation", ["page", "quote", "identifier", "area", "confidence", "status", "provider", "duplicate"]
)
def test_model_cannot_fabricate_evidence_or_commands(sdk, mutation):
    value = response()
    field = value["extraction"]["fields"][0]
    if mutation == "page":
        field["page_number"] = 2
    if mutation == "quote":
        field["raw_text"] = "invented-identifier"
    if mutation == "identifier":
        field["normalized_value"] = "002"
    if mutation == "area":
        value["extraction"]["fields"][1]["normalized_value"] = "999.00"
    if mutation == "confidence":
        field["confidence"] = "NaN"
    if mutation == "status":
        value["extraction"]["status"] = "APPROVED"
    if mutation == "provider":
        value["provider_id"] = "anthropic"
    if mutation == "duplicate":
        value["extraction"]["fields"].append(deepcopy(field))
    with pytest.raises(bridge.ExtractionError) as exc:
        bridge.validate_response(value, [TEXT])
    assert exc.value.code == "SDK_INVALID_OUTPUT"


def test_uncertainty_and_mismatch_are_deterministic(sdk):
    doc = document()
    result = bridge.validate_response(response(), [TEXT])
    differences = bridge.compare_document(doc, result, {**SOURCE, "area_sqm": "999.00"})
    assert differences[1][1] == "DISCREPANCY"
    result.fields[0].confidence = "0.40"
    assert bridge.compare_document(doc, result, SOURCE)[0][1] == "MANUAL_REVIEW"
    result.warnings = ["Possible ambiguity"]
    assert {row[1] for row in bridge.compare_document(doc, result, SOURCE)} == {"MANUAL_REVIEW"}


def test_scans_do_not_fake_ocr(sdk, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("No model call for unreadable scans")

    monkeypatch.setattr(bridge, "invoke_sdk", forbidden)
    result = bridge.extract_document({**document(), "pages": [""]})
    assert result.fields == [] and result.warnings


def test_child_environment_contains_no_backend_or_ide_secrets(sdk, monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", "secret-database")
    monkeypatch.setenv("SESSION_SECRET", "secret-session")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "personal-key")
    monkeypatch.setenv("CLINE_CONNECTOR_CLI_LAUNCH", "private-context")
    env = bridge._environment(tmp_path)
    assert not {
        "DATABASE_URL",
        "SESSION_SECRET",
        "ANTHROPIC_API_KEY",
        "CLINE_CONNECTOR_CLI_LAUNCH",
    }.intersection(env)
    assert Path(env["CLINE_DATA_DIR"]).is_relative_to(tmp_path)
    assert env["HOME"] == env["USERPROFILE"]


def queued_listing(actors):
    from scripts.seed_demo import demo_location

    seller = actors["seller"]
    listing = seller.command(
        "/seller/listings",
        {
            "title": "SDK test listing",
            "description": "SYNTHETIC DEMO",
            "location": demo_location("004"),
            "original_area": "1200.00",
            "original_unit": "SQM",
            "land_type": "DEMO_LAND",
            "asking_price_inr": "2500000.00",
        },
        status=201,
    )
    content = synthetic_pdf(TEXT.replace("001", "004", 1))
    for kind in verification.REQUIRED_TYPES:
        uploaded = seller.upload("LISTING", listing["id"], kind, content, version=listing["version"])
        listing["version"] = uploaded["owner"]["version"]
    return seller.command(
        f"/seller/listings/{listing['id']}/submit-review",
        {"expected_version": listing["version"]},
        status=202,
    )


def test_sdk_failure_is_failed_job_not_simulated_approval(world, actors, sdk, monkeypatch):
    queued = queued_listing(actors)

    def fail(doc):
        raise bridge.ExtractionError("SDK_NOT_CONFIGURED")

    monkeypatch.setattr(bridge, "extract_document", fail)
    with SessionLocal() as db:
        assert verification.process_jobs(db) == [queued["verification_job"]["id"]]
        job = db.get(VerificationJob, queued["verification_job"]["id"])
        assert job.status == "FAILED" and job.findings == []
        assert "SDK_NOT_CONFIGURED" in job.error_message
        assert db.get(Listing, queued["listing"]["id"]).status == "UNDER_REVIEW"
    error(
        actors["reviewer"].raw(
            f"/reviews/listings/{queued['listing']['id']}/decision",
            {
                "expected_version": queued["listing"]["version"],
                "decision": "APPROVE",
                "reason": "Cannot trust failure",
            },
        ),
        409,
        "REVIEW_NOT_CURRENT",
    )


def test_document_change_during_sdk_call_fences_old_findings(world, actors, sdk, monkeypatch):
    queued = queued_listing(actors)
    changed = False

    def extract(doc):
        nonlocal changed
        if not changed:
            changed = True
            actors["seller"].upload(
                "LISTING",
                queued["listing"]["id"],
                "LAND_RECORD",
                synthetic_pdf(TEXT.replace("1200.00", "900.00")),
                version=queued["listing"]["version"],
            )
        return bridge.Extraction(fields=[], warnings=[])

    monkeypatch.setattr(bridge, "extract_document", extract)
    with SessionLocal() as db:
        verification.process_jobs(db)
        job = db.get(VerificationJob, queued["verification_job"]["id"])
        assert job.status == "FAILED" and not job.findings
        assert "changed during" in job.error_message
        assert db.get(Listing, queued["listing"]["id"]).status == "CHANGES_REQUIRED"


def test_policy_selection_changes_invalidate_current_extraction(sdk, monkeypatch):
    old = verification.extraction_policy_version()
    assert len(old) <= 64 and "CLINE-0.0.92" in old
    monkeypatch.setattr(settings, "cline_model_id", "other-model")
    assert verification.extraction_policy_version() != old


def test_subprocess_imports_installed_sdk_without_borrowing_credentials(monkeypatch):
    monkeypatch.setattr(settings, "cline_provider_id", None)
    monkeypatch.setattr(settings, "cline_model_id", None)
    monkeypatch.setattr(settings, "cline_api_key", None)
    monkeypatch.setenv("CLINE_API_KEY", "not-available-to-child")
    result = bridge.invoke_sdk(check=True)
    assert result["sdk_version"] == "0.0.92"
    assert result["ready"] is False
    assert set(result["missing"]) == {"CLINE_PROVIDER_ID", "CLINE_MODEL_ID", "CLINE_API_KEY"}
    assert "not-available-to-child" not in str(result)


def test_actual_runner_rejects_unconfigured_model_no_fallback(sdk, monkeypatch):
    monkeypatch.setattr(settings, "cline_api_key", None)
    with pytest.raises(bridge.ExtractionError) as exc:
        bridge.extract_document(document())
    assert exc.value.code == "SDK_NOT_CONFIGURED"


def test_python_process_real_sdk_with_local_mocked_model(sdk, monkeypatch):
    """Full Python->Node->official SDK->mock model->validated findings, no paid access."""
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    from pydantic import SecretStr

    requests = []
    model_result = response()["extraction"]

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append((self.path, body))
            text = json.dumps(model_result)
            events = [
                {
                    "id": "mock-completion",
                    "object": "chat.completion.chunk",
                    "created": 1,
                    "model": "test-model",
                    "choices": [
                        {"index": 0, "delta": {"role": "assistant", "content": text}, "finish_reason": None}
                    ],
                },
                {
                    "id": "mock-completion",
                    "object": "chat.completion.chunk",
                    "created": 1,
                    "model": "test-model",
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
                },
            ]
            raw = (
                "".join(f"data: {json.dumps(event)}\n\n" for event in events) + "data: [DONE]\n\n"
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, *args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setattr(settings, "cline_api_key", SecretStr("mock-not-a-live-provider-key"))
    monkeypatch.setattr(settings, "cline_base_url", f"http://127.0.0.1:{server.server_port}/v1")
    monkeypatch.setattr(settings, "cline_timeout_seconds", 10)
    try:
        result = bridge.extract_document(document())
        assert len(result.fields) == 3
        assert len(requests) == 1
        path, body = requests[0]
        assert path == "/v1/chat/completions" and body["model"] == "test-model"
        assert not body.get("tools")
        assert {row[1] for row in bridge.compare_document(document(), result, SOURCE)} == {"MATCHES_SOURCE"}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
