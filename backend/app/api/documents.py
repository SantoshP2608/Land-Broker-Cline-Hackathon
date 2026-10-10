"""Strict multipart upload and private, session-bound content delivery."""

import hashlib
import json
from typing import Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError, success
from app.core.security import current_user, require_csrf
from app.db import get_db
from app.models import Document, Listing, Transaction, User
from app.services.common import audit, check_version, command, document_dto, get_or_404, lock_parcel
from app.services.documents import (
    authorized_document,
    decode_download,
    document_owner,
    inspect_content,
    issue_download,
    read_document,
    store_document,
)

router = APIRouter(tags=["documents"])
Scope = Literal["OWNER_AND_OFFICERS", "TRANSACTION_PARTIES_AND_OFFICERS"]
CitizenType = Literal[
    "IDENTITY", "PREVIOUS_DEED", "LAND_RECORD", "ENCUMBRANCE_CERTIFICATE", "SUPPORTING_EVIDENCE", "LAND_PHOTO"
]


class Share(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sharing_scope: Scope
    expected_version: int = Field(ge=1, strict=True)


def locked(db, model, resource_id):
    value = db.scalar(
        select(model)
        .where(model.id == resource_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if value is None:
        raise ApiError(404, "NOT_FOUND", "Resource not found.")
    return value


def upload_owner(db, user, owner_kind, owner_id, document_type, expected_version):
    if owner_kind == "USER":
        if owner_id != user.id:
            raise ApiError(404, "NOT_FOUND", "Owner not visible.")
        if expected_version is not None or document_type not in {"IDENTITY", "SUPPORTING_EVIDENCE"}:
            raise ApiError(
                422, "VALIDATION_ERROR", "USER accepts identity/supporting evidence without an owner version."
            )
        return None
    if expected_version is None:
        raise ApiError(422, "VALIDATION_ERROR", "Mutable attachment owners require expected_version.")
    if owner_kind == "LISTING":
        initial = get_or_404(db, Listing, owner_id)
        if initial.seller_id != user.id:
            raise ApiError(404, "NOT_FOUND", "Listing not visible.")
        parcel = lock_parcel(db, initial.parcel_id)
        owner = locked(db, Listing, owner_id)
        check_version(owner, expected_version)
        if (
            owner.status not in {"DRAFT", "UNDER_REVIEW", "CHANGES_REQUIRED", "APPROVED", "PUBLISHED"}
            or parcel.status != "OPEN"
            or parcel.active_transaction_id
        ):
            raise ApiError(
                409, "INVALID_TRANSITION", "Listing documents cannot change while reserved or closed."
            )
        if document_type == "IDENTITY":
            raise ApiError(422, "VALIDATION_ERROR", "Identity documents belong only to USER.")
        return owner
    initial = get_or_404(db, Transaction, owner_id)
    if user.id not in {initial.seller_id, initial.buyer_id}:
        raise ApiError(404, "NOT_FOUND", "Transaction not visible.")
    lock_parcel(db, initial.parcel_id)
    owner = locked(db, Transaction, owner_id)
    check_version(owner, expected_version)
    if owner.closed_at is not None:
        raise ApiError(409, "INVALID_TRANSITION", "Closed transaction attachments are immutable.")
    if document_type != "SUPPORTING_EVIDENCE":
        raise ApiError(422, "VALIDATION_ERROR", "Transactions accept supporting evidence only.")
    return owner


def invalidate_owner(db, user, owner, action):
    if owner is None:
        return
    previous = owner.status
    if isinstance(owner, Listing):
        owner.approved_document_set_hash = None
        owner.reviewed_at = None
        owner.status = "DRAFT" if owner.status == "DRAFT" else "CHANGES_REQUIRED"
    else:
        owner.confirmed_by = []
        if owner.status in {"DISCUSSION", "AGREEMENT_PREPARATION"}:
            owner.draft_document_id = None
            owner.draft_hash = None
    owner.version += 1
    audit(db, user, owner, action, previous, owner.status)


@router.post("/documents", status_code=201)
async def upload(
    request: Request,
    owner_kind: Literal["USER", "LISTING", "TRANSACTION"] = Form(...),
    owner_id: UUID = Form(...),
    document_type: CitizenType = Form(...),
    sharing_scope: Scope = Form(...),
    file: UploadFile = File(...),
    expected_version: int | None = Form(default=None, ge=1),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require_csrf(request, user)
    form = await request.form()
    allowed = {"owner_kind", "owner_id", "document_type", "sharing_scope", "file", "expected_version"}
    entries = form.multi_items()
    if any(key not in allowed for key, _ in entries) or len(entries) != len({key for key, _ in entries}):
        raise ApiError(422, "VALIDATION_ERROR", "Unknown or duplicate multipart fields are not allowed.")
    if document_type == "IDENTITY" and sharing_scope != "OWNER_AND_OFFICERS":
        raise ApiError(
            422, "VALIDATION_ERROR", "Identity documents cannot be shared with transaction parties."
        )
    # Authorise before reading/parsing bytes; final authorization repeats under lock.
    if owner_kind == "USER" and str(owner_id) != user.id:
        raise ApiError(404, "NOT_FOUND", "Owner not visible.")
    if owner_kind == "LISTING" and get_or_404(db, Listing, str(owner_id)).seller_id != user.id:
        raise ApiError(404, "NOT_FOUND", "Listing not visible.")
    if owner_kind == "TRANSACTION":
        tx = get_or_404(db, Transaction, str(owner_id))
        if user.id not in {tx.seller_id, tx.buyer_id}:
            raise ApiError(404, "NOT_FOUND", "Transaction not visible.")
    content = await file.read(min(settings.max_upload_bytes, 20_971_520) + 1)
    await file.close()
    inspected = inspect_content(content)
    if file.content_type != inspected["mime"]:
        raise ApiError(422, "FILE_REJECTED", "Declared MIME does not match validated content.")
    if document_type == "LAND_PHOTO" and inspected["mime"] not in {"image/jpeg", "image/png"}:
        raise ApiError(422, "FILE_REJECTED", "Land photos must be JPEG or PNG images.")
    payload = {
        "owner_kind": owner_kind,
        "owner_id": str(owner_id),
        "document_type": document_type,
        "sharing_scope": sharing_scope,
        "expected_version": expected_version,
        "filename": file.filename,
        "mime": inspected["mime"],
        "sha256": hashlib.sha256(content).hexdigest(),
    }

    def run():
        owner = upload_owner(db, user, owner_kind, str(owner_id), document_type, expected_version)
        doc = store_document(
            db,
            user,
            owner_kind,
            str(owner_id),
            document_type,
            file.filename,
            content,
            sharing_scope,
            inspected["mime"],
        )
        invalidate_owner(db, user, owner, "DOCUMENTS_CHANGED")
        audit(db, user, doc, "DOCUMENT_UPLOADED", None, document_type)
        return {
            "document": document_dto(doc),
            "owner": {"id": owner.id, "version": owner.version} if owner else None,
        }

    return command(request, db, user, payload, run, 201)


@router.get("/documents/{id}")
def metadata(id: UUID, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    doc = authorized_document(db, get_or_404(db, Document, str(id)), user)
    return success(request, document_dto(doc))


@router.get("/documents/{id}/download")
def download(id: UUID, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    doc = authorized_document(db, get_or_404(db, Document, str(id)), user)
    return success(request, issue_download(request, user, "document", doc.id))


@router.post("/documents/{id}/share")
def share(id: UUID, body: Share, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    if not document_owner(db, get_or_404(db, Document, str(id)), user):
        raise ApiError(404, "NOT_FOUND", "Document not owned.")

    def run():
        initial = get_or_404(db, Document, str(id))
        if not document_owner(db, initial, user):
            raise ApiError(404, "NOT_FOUND", "Document not owned.")
        owner = None
        if initial.owner_kind == "LISTING":
            listing = get_or_404(db, Listing, initial.owner_id)
            parcel = lock_parcel(db, listing.parcel_id)
            owner = locked(db, Listing, listing.id)
            if (
                parcel.active_transaction_id
                or parcel.status != "OPEN"
                or owner.status in {"CLOSED", "WITHDRAWN"}
            ):
                raise ApiError(
                    409, "INVALID_TRANSITION", "Listing sharing cannot change while reserved or closed."
                )
        elif initial.owner_kind == "TRANSACTION":
            tx = get_or_404(db, Transaction, initial.owner_id)
            lock_parcel(db, tx.parcel_id)
            owner = locked(db, Transaction, tx.id)
            if owner.closed_at is not None:
                raise ApiError(409, "INVALID_TRANSITION", "Closed document sharing is immutable.")
        doc = locked(db, Document, initial.id)
        if not document_owner(db, doc, user):
            raise ApiError(404, "NOT_FOUND", "Document not owned.")
        check_version(doc, body.expected_version)
        if doc.document_type in {"DRAFT_DEED", "REGISTERED_DEED"}:
            raise ApiError(403, "FORBIDDEN", "Generated deed sharing is managed by the workflow.")
        if doc.document_type == "IDENTITY" and body.sharing_scope != "OWNER_AND_OFFICERS":
            raise ApiError(
                422, "VALIDATION_ERROR", "Identity documents cannot be shared with transaction parties."
            )
        if doc.sharing_scope != body.sharing_scope:
            previous = doc.sharing_scope
            doc.sharing_scope = body.sharing_scope
            doc.version += 1
            invalidate_owner(db, user, owner, "DOCUMENT_SHARING_CHANGED")
            audit(db, user, doc, "DOCUMENT_SHARED", previous, doc.sharing_scope)
        return document_dto(doc)

    return command(request, db, user, body.model_dump(), run)


@router.get("/downloads/{token}")
def content(token: str, user=Depends(current_user), db: Session = Depends(get_db)):
    data = decode_download(token, user)
    if data["kind"] == "document":
        doc = authorized_document(db, get_or_404(db, Document, data["resource"]), user)
        raw, mime, filename = read_document(doc), doc.mime, doc.filename
    else:
        from app.services.transactions import report_data, transaction_access

        tx = get_or_404(db, Transaction, data["resource"])
        transaction_access(db, tx, user)
        raw = json.dumps(report_data(db, tx, user), ensure_ascii=False, indent=2).encode()
        mime, filename = "text/plain; charset=utf-8", f"transaction-{tx.id}.txt"
    return Response(
        raw,
        media_type=mime,
        headers={
            "Cache-Control": "private, no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename, safe='')}",
        },
    )
