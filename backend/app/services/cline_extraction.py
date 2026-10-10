"""Bounded private subprocess adapter to the official Cline SDK, not a model HTTP wrapper."""

import json
import os
import subprocess
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.core.config import BACKEND_ROOT, settings

SDK_VERSION = "0.0.92"
FIELD_NAMES = ("survey_number", "area_sqm", "owner_subject_ref")


class ExtractionError(Exception):
    """Safe fixed diagnostic; provider exceptions and evidence never enter API logs."""

    def __init__(self, code):
        self.code = code
        super().__init__(code)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExtractedField(Strict):
    field_name: Literal["survey_number", "area_sqm", "owner_subject_ref"]
    raw_text: str = Field(min_length=1, max_length=2000)
    normalized_value: str = Field(min_length=1, max_length=2000)
    page_number: int = Field(ge=1, le=100, strict=True)
    confidence: str = Field(max_length=10)
    uncertainty_notes: list[str] = Field(max_length=10)

    @field_validator("confidence")
    @classmethod
    def bounded_confidence(cls, value):
        import re

        if not re.fullmatch(r"(?:0(?:\.[0-9]+)?|1(?:\.0+)?)", value):
            raise ValueError("Confidence must be a decimal string between 0 and 1.")
        return value

    @field_validator("uncertainty_notes")
    @classmethod
    def bounded_notes(cls, value):
        if any(len(note) > 500 for note in value):
            raise ValueError("Uncertainty note exceeds limit.")
        return value


class Extraction(Strict):
    fields: list[ExtractedField] = Field(max_length=30)
    warnings: list[str] = Field(max_length=20)

    @field_validator("warnings")
    @classmethod
    def bounded_warnings(cls, value):
        if any(len(note) > 500 for note in value):
            raise ValueError("Warning exceeds limit.")
        return value


class SDKResponse(Strict):
    protocol_version: Literal[1]
    sdk_version: Literal["0.0.92"]
    provider_id: str
    model_id: str
    extraction: Extraction


def validate_response(response, pages):
    """Fence hallucinated pages/quotes and normalization that changes identifiers."""
    try:
        result = SDKResponse.model_validate(response)
        secret = settings.cline_api_key.get_secret_value() if settings.cline_api_key else None
        if secret and secret in json.dumps(response):
            raise ValueError("Output cannot contain credentials.")
        if result.provider_id != settings.cline_provider_id or result.model_id != settings.cline_model_id:
            raise ValueError("Model provenance mismatch.")
        seen = set()
        for field in result.extraction.fields:
            if field.page_number > len(pages) or field.raw_text not in pages[field.page_number - 1]:
                raise ValueError("Evidence quote is not present on the referenced page.")
            key = (field.field_name, field.page_number, field.raw_text)
            if key in seen:
                raise ValueError("Duplicate evidence.")
            seen.add(key)
            if field.field_name != "area_sqm" and field.normalized_value != field.raw_text.strip():
                raise ValueError("Identifier normalization must preserve source text.")
            if field.field_name == "area_sqm":
                from app.domain import decimal_string, parse_decimal

                expected = decimal_string(parse_decimal(field.raw_text.strip()))
                if field.normalized_value != expected:
                    raise ValueError("Area normalization differs from deterministic decimal conversion.")
        return result.extraction
    except (ValidationError, ValueError, TypeError):
        raise ExtractionError("SDK_INVALID_OUTPUT") from None


def _environment(workspace):
    # Do not inherit DB, simulator, session, IDE or personal provider credentials.
    keep = {
        "PATH",
        "SYSTEMROOT",
        "WINDIR",
        "COMSPEC",
        "PATHEXT",
        "TEMP",
        "TMP",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "NODE_EXTRA_CA_CERTS",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
    }
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    home = str(workspace / "home")
    env.update(
        HOME=home,
        USERPROFILE=home,
        APPDATA=str(workspace / "appdata"),
        LOCALAPPDATA=str(workspace / "localappdata"),
        CLINE_DIR=str(workspace / "cline"),
        CLINE_DATA_DIR=str(workspace / "cline" / "data"),
        CLINE_WORKSPACE=str(workspace / "workspace"),
        CLINE_TIMEOUT_SECONDS=str(settings.cline_timeout_seconds),
        OTEL_SDK_DISABLED="true",
        DO_NOT_TRACK="1",
        NO_COLOR="1",
    )
    for name, value in [
        ("CLINE_PROVIDER_ID", settings.cline_provider_id),
        ("CLINE_MODEL_ID", settings.cline_model_id),
        ("CLINE_BASE_URL", settings.cline_base_url),
    ]:
        if value:
            env[name] = value
    if settings.cline_api_key:
        env["CLINE_API_KEY"] = settings.cline_api_key.get_secret_value()
    for child in ("home", "appdata", "localappdata", "workspace", "cline/data"):
        (workspace / child).mkdir(parents=True, exist_ok=True)
    return env


def invoke_sdk(payload=None, *, check=False):
    runner = BACKEND_ROOT / "ai_worker" / "src" / "runner.mjs"
    with tempfile.TemporaryDirectory(prefix="land-cline-") as temporary:
        workspace = Path(temporary)
        environment = _environment(workspace)
        output = workspace / "response.json"
        with output.open("wb") as stdout:
            try:
                process = subprocess.Popen(
                    [settings.cline_node_executable, str(runner), *(["--check"] if check else [])],
                    cwd=workspace / "workspace",
                    env=environment,
                    stdin=subprocess.PIPE,
                    stdout=stdout,
                    stderr=subprocess.DEVNULL,
                    shell=False,
                )
                try:
                    process.communicate(
                        json.dumps(payload).encode("utf-8") if payload else None,
                        timeout=settings.cline_timeout_seconds + 5,
                    )
                except subprocess.TimeoutExpired:
                    if os.name == "nt":
                        subprocess.run(
                            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            check=False,
                        )
                    process.kill()
                    process.communicate()
                    raise ExtractionError("SDK_TIMEOUT") from None
            except OSError:
                raise ExtractionError("SDK_NOT_INSTALLED") from None
        if output.stat().st_size > 100_000:
            raise ExtractionError("SDK_INVALID_OUTPUT")
        try:
            data = json.loads(output.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            raise ExtractionError("SDK_RUN_FAILED") from None
        if process.returncode:
            code = data.get("error", {}).get("code") if isinstance(data, dict) else None
            safe = {"SDK_NOT_CONFIGURED", "SDK_TIMEOUT", "SDK_INVALID_OUTPUT", "SDK_RUN_FAILED"}
            raise ExtractionError(code if code in safe else "SDK_RUN_FAILED")
        return data


def extract_document(doc):
    pages = doc["pages"]
    if not pages or len(pages) > 100 or sum(len(text) for text in pages) > 200_000:
        raise ExtractionError("SDK_INPUT_LIMIT")
    # Non-text scans are a manual-review path, not invented OCR success.
    if not any(text.strip() for text in pages):
        return Extraction(
            fields=[], warnings=["No extractable text; scanned evidence requires OCR/manual review."]
        )
    payload = {
        "protocol_version": 1,
        "document": {
            "id": doc["id"],
            "version": doc["version"],
            "sha256": doc["sha256"],
            "document_type": doc["document_type"],
        },
        "pages": [{"page_number": number, "text": text} for number, text in enumerate(pages, 1)],
    }
    return validate_response(invoke_sdk(payload), pages)


def compare_document(doc, extraction, sources):
    """Model reads fields; deterministic code alone compares configured synthetic records."""
    from app.services.verification import _evidence

    comparisons = []
    for name in FIELD_NAMES:
        fields = [field for field in extraction.fields if field.field_name == name]
        evidence = []
        for field in fields:
            ref = _evidence(doc, field.page_number, name, field.raw_text, field.normalized_value)
            ref["confidence"] = field.confidence
            evidence.append(ref)
        if not fields or not sources.get(name):
            status, summary = (
                "MANUAL_REVIEW",
                f"{name} is missing; Cline SDK did not establish a source comparison.",
            )
        elif len({field.normalized_value for field in fields}) != 1:
            status, summary = (
                "DISCREPANCY",
                f"Cline SDK extracted conflicting {name} readings; deterministic comparison found a contradiction.",
            )
        elif extraction.warnings or any(
            field.uncertainty_notes or Decimal(field.confidence) < Decimal(settings.cline_min_confidence)
            for field in fields
        ):
            status, summary = (
                "MANUAL_REVIEW",
                f"Cline SDK {name} extraction is uncertain; human review is required.",
            )
        else:
            matched = fields[0].normalized_value == sources[name]
            status = "MATCHES_SOURCE" if matched else "DISCREPANCY"
            summary = f"Cline SDK extracted {name}; deterministic comparison {'matches' if matched else 'differs from'} the synthetic registry. Not authenticity or title assurance."
        right = None
        if status == "DISCREPANCY" and len(evidence) > 1:
            right = next(
                (ref for ref in evidence[1:] if ref["normalized_value"] != evidence[0]["normalized_value"]),
                None,
            )
        comparisons.append((name, status, summary, evidence[0] if evidence else None, right))
    return comparisons
