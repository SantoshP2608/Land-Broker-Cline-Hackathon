"""Password/session endpoints. Registration never provisions officer privileges."""

import re
import secrets
import threading
from collections import OrderedDict, deque
from time import monotonic
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.core.errors import ApiError, success
from app.core.security import (
    SESSION_COOKIE_NAME,
    check_origin,
    clear_session_cookie,
    current_user,
    hash_password,
    new_session,
    require_csrf,
    session_token_hash,
    set_session_cookie,
    user_dto,
    verify_password,
)
from app.db import get_db
from app.models import Session, User, new_id

router = APIRouter(prefix="/auth", tags=["auth"])
EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+\Z", re.ASCII)


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RegisterInput(StrictSchema):
    display_name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("display_name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(character) < 32 for character in value):
            raise ValueError("Provide a nonempty display name without control characters.")
        return value

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return validate_email(value)


class LoginInput(StrictSchema):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return validate_email(value)


class LogoutInput(StrictSchema):
    """The logout command has no citizen-editable fields."""


class UserOutput(StrictSchema):
    id: str
    display_name: str
    roles: list[str]
    identity_status: Literal["PENDING", "CONFIRMED", "FAILED"]
    identity_mode: Literal["SIMULATED", "CONNECTED"]


class MetaOutput(StrictSchema):
    request_id: str
    contract_version: Literal["0.1"]


class RegisterOutput(StrictSchema):
    data: UserOutput
    meta: MetaOutput


class SessionData(StrictSchema):
    user: UserOutput
    csrf_token: str


class SessionOutput(StrictSchema):
    data: SessionData
    meta: MetaOutput


class LogoutData(StrictSchema):
    logged_out: Literal[True]


class LogoutOutput(StrictSchema):
    data: LogoutData
    meta: MetaOutput


def validate_email(value: str) -> str:
    value = value.strip().lower()
    if not value.isascii() or not EMAIL_PATTERN.fullmatch(value) or len(value.split("@", 1)[0]) > 64:
        raise ValueError("Provide a valid email address.")
    return value


class AuthRateLimiter:
    """Bounded, thread-safe per-process demo protection; production needs shared limits."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._attempts: OrderedDict[tuple[str, str], deque[float]] = OrderedDict()

    def check(self, request: Request, operation: str, maximum: int, window: int) -> None:
        # Do not trust arbitrary forwarded headers as client identity.
        peer = request.client.host if request.client is not None else "unknown"
        key = (operation, peer)
        now = monotonic()
        with self._lock:
            attempts = self._attempts.setdefault(key, deque())
            self._attempts.move_to_end(key)
            while attempts and attempts[0] <= now - window:
                attempts.popleft()
            if len(attempts) >= maximum:
                raise ApiError(429, "RATE_LIMITED", "Too many authentication attempts; retry later.")
            attempts.append(now)
            while len(self._attempts) > 10_000:
                self._attempts.popitem(last=False)


rate_limiter = AuthRateLimiter()
# Perform a real password verification for absent users too, avoiding a cheap account oracle.
dummy_password_hash = hash_password(secrets.token_urlsafe(32))


@router.post("/register", status_code=201, response_model=RegisterOutput)
def register(
    body: RegisterInput,
    request: Request,
    response: Response,
    db: DbSession = Depends(get_db),
) -> dict[str, Any]:
    check_origin(request)
    rate_limiter.check(request, "register", maximum=10, window=3600)
    if db.scalar(select(User.id).where(User.email == body.email)) is not None:
        raise ApiError(
            409,
            "VALIDATION_ERROR",
            "This email cannot be registered.",
            field_errors={"email": ["An account with this email already exists."]},
        )
    user = User(
        id=new_id(),
        display_name=body.display_name,
        email=body.email,
        password_hash=hash_password(body.password),
        roles=["CITIZEN"],
        identity_status="PENDING",
        identity_mode="SIMULATED",
        disabled=False,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ApiError(
            409,
            "VALIDATION_ERROR",
            "This email cannot be registered.",
            field_errors={"email": ["An account with this email already exists."]},
        ) from exc
    response.headers["Cache-Control"] = "no-store"
    return success(request, user_dto(user))


@router.post("/login", response_model=SessionOutput)
def login(
    body: LoginInput,
    request: Request,
    response: Response,
    db: DbSession = Depends(get_db),
) -> dict[str, Any]:
    check_origin(request)
    rate_limiter.check(request, "login", maximum=20, window=300)
    user = db.scalar(select(User).where(User.email == body.email))
    valid = verify_password(body.password, user.password_hash if user is not None else dummy_password_hash)
    if not valid or user is None or user.disabled:
        raise ApiError(401, "AUTH_REQUIRED", "The email or password is incorrect.")
    old_token = request.cookies.get(SESSION_COOKIE_NAME)
    if old_token and len(old_token) <= 256:
        old_session = db.get(Session, session_token_hash(old_token))
        if old_session is not None:
            db.delete(old_session)
    token, session_record = new_session(user)
    db.add(session_record)
    db.commit()
    set_session_cookie(response, token)
    return success(request, {"user": user_dto(user), "csrf_token": session_record.csrf_token})


@router.get("/session", response_model=SessionOutput)
def read_session(request: Request, response: Response, user: User = Depends(current_user)) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    session_record: Session = request.state.session
    return success(request, {"user": user_dto(user), "csrf_token": session_record.csrf_token})


@router.post("/logout", response_model=LogoutOutput)
def logout(
    request: Request,
    response: Response,
    body: Annotated[LogoutInput | None, Body()] = None,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict[str, Any]:
    require_csrf(request, user)
    session_record: Session = request.state.session
    db.delete(session_record)
    db.commit()
    clear_session_cookie(response)
    return success(request, {"logged_out": True})
