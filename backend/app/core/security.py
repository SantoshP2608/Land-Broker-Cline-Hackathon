"""Opaque server sessions, Argon2 passwords and session-bound CSRF checks."""

import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Any

from fastapi import Depends, Request, Response
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.errors import ApiError
from app.db import get_db
from app.domain import as_utc
from app.models import Session, User, utcnow

SESSION_COOKIE_NAME = "land_session"
SESSION_COOKIE = SESSION_COOKIE_NAME
SESSION_DURATION = timedelta(days=7)
password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password, password_hash)
    except (UnknownHashError, ValueError):
        return False


def session_token_hash(token: str) -> str:
    return hmac.new(settings.session_secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def new_session(user: User) -> tuple[str, Session]:
    """Return the bearer token once; only its keyed hash is stored in the database."""
    token = secrets.token_urlsafe(48)
    session = Session(
        token_hash=session_token_hash(token),
        user_id=user.id,
        csrf_token=secrets.token_urlsafe(32),
        expires_at=utcnow() + SESSION_DURATION,
    )
    return token, session


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=int(SESSION_DURATION.total_seconds()),
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/api/v1",
    )
    response.headers["Cache-Control"] = "no-store"


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/api/v1",
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"


def optional_user(request: Request, db: DbSession = Depends(get_db)) -> User | None:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token is None:
        return None
    if not token or len(token) > 256:
        raise ApiError(401, "AUTH_REQUIRED", "A valid session is required.")
    session = db.get(Session, session_token_hash(token))
    if session is None or as_utc(session.expires_at) <= utcnow():
        raise ApiError(401, "AUTH_REQUIRED", "Your session has expired or was revoked.")
    user = db.get(User, session.user_id)
    if user is None or user.disabled:
        raise ApiError(401, "AUTH_REQUIRED", "This session is no longer valid.")
    request.state.session = session
    request.state.user = user
    return user


def current_user(request: Request, db: DbSession = Depends(get_db)) -> User:
    user = optional_user(request, db)
    if user is None:
        raise ApiError(401, "AUTH_REQUIRED", "A valid session is required.")
    return user


def check_origin(request: Request) -> None:
    """CORS is not an authorisation check: reject hostile origins on mutations."""
    origin = request.headers.get("origin")
    if origin is not None and origin not in settings.allowed_origins:
        raise ApiError(403, "FORBIDDEN", "The request origin is not allowed.")
    if request.headers.get("sec-fetch-site") == "cross-site" and origin is None:
        raise ApiError(403, "FORBIDDEN", "Cross-site requests require an allowed origin.")


def require_csrf(request: Request, user: User) -> None:
    check_origin(request)
    session = getattr(request.state, "session", None)
    submitted = request.headers.get("x-csrf-token")
    if (
        session is None
        or user.disabled
        or session.user_id != user.id
        or as_utc(session.expires_at) <= utcnow()
        or not submitted
        or len(submitted) > 256
        or not hmac.compare_digest(submitted.encode(), session.csrf_token.encode())
    ):
        raise ApiError(403, "FORBIDDEN", "A valid session-bound CSRF token is required.")


def user_dto(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "display_name": user.display_name,
        "roles": list(user.roles),
        "identity_status": user.identity_status,
        "identity_mode": user.identity_mode,
    }
