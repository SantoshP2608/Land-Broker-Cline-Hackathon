"""Validated configuration; demo defaults are never production credentials."""

from functools import lru_cache
from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "postgresql+psycopg://land_demo@127.0.0.1:55432/land_demo"
    session_secret: str = Field(default="local-synthetic-demo-only-change-before-sharing", min_length=32)
    simulator_secret: str = Field(default="local-simulator-demo-only-change-before-sharing", min_length=32)
    allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    storage_path: Path = BACKEND_ROOT.parent / ".private-storage"
    official_integration_mode: Literal["SIMULATED", "CONNECTED"] = "SIMULATED"
    policy_state_code: str = "KA"
    discussion_response_hours: int = Field(default=24, gt=0)
    evidence_response_hours: int = Field(default=48, gt=0)
    official_check_max_age_seconds: int = Field(default=300, gt=0)
    app_env: str = "development"
    max_upload_bytes: int = Field(default=20_971_520, gt=0)
    document_extraction_backend: Literal["CLINE_SDK", "SIMULATED"] = "CLINE_SDK"
    cline_provider_id: Literal["anthropic", "openai", "openrouter", "ollama"] | None = None
    cline_model_id: str | None = Field(default=None, min_length=1, max_length=200)
    cline_api_key: SecretStr | None = None
    cline_base_url: str | None = None
    cline_node_executable: str = "node"
    cline_timeout_seconds: int = Field(default=60, ge=5, le=120)
    cline_min_confidence: str = "0.80"

    @field_validator("cline_provider_id", "cline_model_id", "cline_api_key", "cline_base_url", mode="before")
    @classmethod
    def empty_sdk_config(cls, value):
        return None if value == "" else value

    @field_validator("cline_min_confidence")
    @classmethod
    def valid_min_confidence(cls, value):
        import re

        if not re.fullmatch(r"(?:0(?:\.[0-9]+)?|1(?:\.0+)?)", value):
            raise ValueError("CLINE_MIN_CONFIDENCE must be a decimal string between 0 and 1.")
        return value

    @field_validator("cline_base_url")
    @classmethod
    def sdk_endpoint(cls, value):
        if value:
            parsed = urlsplit(value)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    "CLINE_BASE_URL must be an HTTP(S) endpoint without credentials/query/fragment."
                )
        return value

    @field_validator("storage_path")
    @classmethod
    def absolute_storage_path(cls, value: Path) -> Path:
        return (value if value.is_absolute() else BACKEND_ROOT / value).resolve()

    @field_validator("allowed_origins")
    @classmethod
    def exact_origins(cls, value: list[str]) -> list[str]:
        for origin in value:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
                or parsed.username
                or "*" in origin
            ):
                raise ValueError("Each allowed origin must be an exact HTTP(S) origin, not a wildcard.")
        return list(dict.fromkeys(origin.rstrip("/") for origin in value))

    @model_validator(mode="after")
    def production_security(self) -> Self:
        if self.official_integration_mode != "SIMULATED":
            raise ValueError(
                "This build supports synthetic SIMULATED adapters only; CONNECTED is not implemented."
            )
        if self.app_env.lower() not in {"development", "local", "test", "testing"}:
            if self.session_secret.startswith("local-") or self.simulator_secret.startswith("local-"):
                raise ValueError("Nonlocal environments require explicitly configured secrets.")
            if any(not origin.startswith("https://") for origin in self.allowed_origins):
                raise ValueError("Nonlocal environments require HTTPS frontend origins.")
        return self

    @property
    def secure_cookies(self) -> bool:
        return self.app_env.lower() not in {"development", "local", "test", "testing"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
