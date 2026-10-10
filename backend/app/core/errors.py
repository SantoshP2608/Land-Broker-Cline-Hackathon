"""Contract success/error envelopes and safe framework exception adapters."""

import logging
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)
CONTRACT_VERSION = "0.1"


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        retryable: bool = False,
        field_errors: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.status_code = status
        self.code = code
        self.message = message
        self.retryable = retryable
        self.field_errors = field_errors if field_errors is not None else {}


def meta(request: Request) -> dict[str, str]:
    request_id = getattr(request.state, "request_id", None)
    if request_id is None:
        request_id = f"req_{uuid4().hex}"
        request.state.request_id = request_id
    return {"request_id": str(request_id), "contract_version": CONTRACT_VERSION}


def success(request: Request, data: Any) -> dict[str, Any]:
    return {"data": data, "meta": meta(request)}


def error_envelope(request: Request, error: ApiError) -> dict[str, Any]:
    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "field_errors": error.field_errors,
            "retryable": error.retryable,
        },
        "meta": meta(request),
    }


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content=jsonable_encoder(error_envelope(request, exc)))


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    if any(issue["type"] == "json_invalid" for issue in exc.errors()):
        return await api_error_handler(request, ApiError(400, "VALIDATION_ERROR", "Invalid JSON syntax."))
    fields: dict[str, list[str]] = {}
    for issue in exc.errors():
        location = ".".join(str(part) for part in issue["loc"] if part not in {"body", "query", "path"})
        # Never echo the input field: validation input may contain passwords/private evidence.
        fields.setdefault(location or "request", []).append(str(issue["msg"]))
    return await api_error_handler(
        request, ApiError(422, "VALIDATION_ERROR", "Request validation failed.", field_errors=fields)
    )


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    mapping = {
        400: ("VALIDATION_ERROR", "Invalid request syntax."),
        401: ("AUTH_REQUIRED", "A valid session is required."),
        403: ("FORBIDDEN", "This action is not permitted."),
        404: ("NOT_FOUND", "The requested resource was not found."),
        405: ("VALIDATION_ERROR", "This HTTP method is not supported."),
        413: ("FILE_REJECTED", "The uploaded file is too large."),
        422: ("VALIDATION_ERROR", "Request validation failed."),
        429: ("RATE_LIMITED", "Too many requests; retry later."),
    }
    code, message = mapping.get(
        exc.status_code, ("DEPENDENCY_UNAVAILABLE", "Request could not be completed.")
    )
    response = await api_error_handler(
        request, ApiError(exc.status_code, code, message, retryable=exc.status_code >= 500)
    )
    if exc.headers:
        response.headers.update(exc.headers)
    return response


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log exception type and correlation only, never exception repr or request bodies.
    logger.error("Unhandled %s request_id=%s", type(exc).__name__, meta(request)["request_id"])
    return await api_error_handler(
        request,
        ApiError(503, "DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.", retryable=True),
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)
