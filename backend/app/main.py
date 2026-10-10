"""One synthetic demo API for seller, buyer and provisioned officers."""

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, documents, identity, listings, notifications, registration, reviews, transactions
from app.core.config import settings
from app.core.errors import install_error_handlers, success
from app.schemas import apply_response_schemas

app = FastAPI(
    title="Karnataka Synthetic Land Marketplace",
    version="0.1",
    description="DEMONSTRATION — SIMULATED GOVERNMENT RECORDS. Synthetic documents and accounts; Cline SDK extraction requires configured provider access.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key"],
)
install_error_handlers(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = f"req_{uuid4().hex}"
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/v1/health", tags=["configuration"])
def health(request: Request):
    return success(request, {"contract_version": "0.1", "integration_mode": "SIMULATED"})


@app.get("/api/v1/configuration", tags=["configuration"])
def configuration(request: Request):
    return success(
        request,
        {
            "policy_version": "KA-SYNTHETIC-0.1",
            "supported_states": [{"code": "KA", "name": "Karnataka", "synthetic_only": True}],
            "land_types": ["DEMO_LAND"],
            "required_documents_by_land_type": {
                "DEMO_LAND": ["PREVIOUS_DEED", "LAND_RECORD", "ENCUMBRANCE_CERTIFICATE"]
            },
            "allowed_original_area_units": ["SQM", "ACRE", "GUNTHA"],
            "max_upload_bytes": settings.max_upload_bytes,
            "allowed_file_types": ["application/pdf", "image/jpeg", "image/png"],
            "integration_mode": "SIMULATED",
            "demo_notice": "DEMONSTRATION — SIMULATED GOVERNMENT RECORDS. All accounts, geographic codes, documents and policies are synthetic; no legal/title assurance.",
        },
    )


for router in [
    auth.router,
    identity.router,
    listings.router,
    documents.router,
    transactions.router,
    reviews.router,
    registration.router,
    notifications.router,
]:
    apply_response_schemas(router)
    app.include_router(router, prefix="/api/v1")
apply_response_schemas(app)

_original_openapi = app.openapi


def contract_openapi():
    schema = _original_openapi()
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["CookieSession"] = {
        "type": "apiKey",
        "in": "cookie",
        "name": "land_session",
        "description": "HttpOnly session; send credentials and obtain CSRF via /auth/session.",
    }
    public = {
        "/api/v1/health",
        "/api/v1/configuration",
        "/api/v1/listings",
        "/api/v1/listings/{id}",
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/integrations/registration/events",
    }
    for path, operations in schema["paths"].items():
        for operation in operations.values():
            for status in ["401", "403", "404", "409", "422", "429", "503"]:
                operation["responses"][status] = {
                    "description": "Contract error envelope",
                    "content": {
                        "application/json": {"schema": {"$ref": "#/components/schemas/ErrorEnvelope"}}
                    },
                }
        if path == "/api/v1/auth/logout":
            operations["post"]["parameters"] = [
                {"name": "X-CSRF-Token", "in": "header", "required": True, "schema": {"type": "string"}}
            ]
        if path not in public:
            for operation in operations.values():
                operation["security"] = [{"CookieSession": []}]
    return schema


app.openapi = contract_openapi
