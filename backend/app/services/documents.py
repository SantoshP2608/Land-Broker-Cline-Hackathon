"""Private immutable bytes, relationship-based ACLs and short-lived downloads.

Untrusted PDF/image parsing runs in a disposable subprocess with a deadline.
This demonstration is not an antivirus or a production document sandbox.
"""

import base64
import hashlib
import hmac
import io
import json
import os
import re
import subprocess
import sys
import textwrap
import warnings
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.core.errors import ApiError
from app.domain import iso_utc
from app.models import (
    CancellationCase,
    Document,
    HoldCase,
    IdentitySubmission,
    Listing,
    Transaction,
    new_id,
    utcnow,
)

MAX_PAGES = 100
MAX_TEXT = 200_000
DOWNLOAD_TTL = 120
ACTIVE_KEYS = {
    "/JavaScript",
    "/JS",
    "/Launch",
    "/OpenAction",
    "/AA",
    "/EmbeddedFiles",
    "/RichMedia",
    "/XFA",
    "/SubmitForm",
    "/ImportData",
    "/GoToR",
    "/GoToE",
    "/URI",
    "/Movie",
    "/Sound",
    "/Rendition",
    "/3D",
    "/AcroForm",
    "/Filespec",
}


def synthetic_pdf(text: str) -> bytes:
    """Generate real paginated PDFs with escaped strings and no active content."""
    if len(text) > MAX_TEXT:
        raise ValueError("Synthetic PDF text exceeds the configured limit.")
    lines = []
    for line in text.splitlines():
        line = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", line)
        lines.extend(textwrap.wrap(line, width=95, replace_whitespace=True) or [""])
    chunks = [lines[start : start + 58] for start in range(0, len(lines), 58)] or [[]]
    if len(chunks) > MAX_PAGES:
        raise ValueError("Synthetic PDF page limit exceeded.")
    kids = " ".join(f"{4 + i * 2} 0 R" for i in range(len(chunks)))
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(chunks)} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for i, chunk in enumerate(chunks):
        stream = b"BT /F1 10 Tf 40 800 Td 12 TL\n"
        for line in ["DEMONSTRATION - SYNTHETIC RECORDS", *chunk]:
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            stream += b"(" + escaped.encode("ascii", "replace") + b") Tj T*\n"
        stream += b"ET\n"
        objects.extend(
            [
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {5 + i * 2} 0 R >>".encode(),
                b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream",
            ]
        )
    result = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result += str(i).encode() + b" 0 obj\n" + obj + b"\nendobj\n"
    start = len(result)
    result += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    result += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    return (
        result + f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    )


def _inspect(content: bytes) -> dict:
    """Executed only by the isolated parser subprocess."""
    if not content or len(content) > min(settings.max_upload_bytes, 20_971_520):
        raise ValueError("Invalid file size.")
    if content.startswith(b"%PDF-"):
        from pypdf import PdfReader
        from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject

        reader = PdfReader(io.BytesIO(content), strict=True)
        if reader.is_encrypted or not 1 <= len(reader.pages) <= MAX_PAGES:
            raise ValueError("Encrypted or excessive-page PDFs are not accepted.")
        seen = set()
        nodes = 0

        def visit(value, depth=0):
            nonlocal nodes
            nodes += 1
            if nodes > 30_000 or depth > 60:
                raise ValueError("PDF structure exceeds safe limits.")
            if isinstance(value, IndirectObject):
                key = (value.idnum, value.generation)
                if key in seen:
                    return
                seen.add(key)
                value = value.get_object()
            if isinstance(value, DictionaryObject):
                if ACTIVE_KEYS.intersection(str(key) for key in value):
                    raise ValueError("Active PDF content is prohibited.")
                if str(value.get("/S", "")) in ACTIVE_KEYS or value.get("/Type") == "/EmbeddedFile":
                    raise ValueError("Active PDF content is prohibited.")
                for item in value.values():
                    visit(item, depth + 1)
            elif isinstance(value, ArrayObject):
                for item in value:
                    visit(item, depth + 1)

        # Walk all objects, including unreferenced malicious action dictionaries.
        for generation, entries in reader.xref.items():
            if generation == 65535:
                continue
            for number in entries:
                if number:
                    visit(IndirectObject(number, generation, reader))
        for number in reader.xref_objStm:
            visit(IndirectObject(number, 0, reader))
        texts = []
        total = 0
        for page in reader.pages:
            text = page.extract_text() or ""
            total += len(text)
            if total > MAX_TEXT:
                raise ValueError("PDF text exceeds safe limits.")
            texts.append(text)
        return {"mime": "application/pdf", "pages": texts}
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = 25_000_000
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(content)) as image:
            if image.format not in {"JPEG", "PNG"} or getattr(image, "n_frames", 1) != 1:
                raise ValueError("Only single-frame JPEG and PNG images are accepted.")
            mime = "image/jpeg" if image.format == "JPEG" else "image/png"
            image.verify()
        with Image.open(io.BytesIO(content)) as image:
            image.load()
    return {"mime": mime, "pages": []}


def inspect_content(content: bytes) -> dict:
    if not content:
        raise ApiError(422, "FILE_REJECTED", "Empty files are not accepted.")
    if len(content) > min(settings.max_upload_bytes, 20_971_520):
        raise ApiError(413, "FILE_REJECTED", "The upload exceeds the configured size limit.")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "app.services.documents", "--inspect"],
            input=content,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            cwd=Path(__file__).resolve().parents[2],
            timeout=12,
            check=True,
        )
        parsed = json.loads(result.stdout)
        if parsed.get("mime") not in {"application/pdf", "image/jpeg", "image/png"}:
            raise ValueError("Unsupported content.")
        return parsed
    except (subprocess.SubprocessError, ValueError, OSError):
        raise ApiError(422, "FILE_REJECTED", "File is invalid, unsafe, or exceeds parser limits.") from None


def safe_filename(filename: str) -> str:
    filename = re.split(r"[/\\]", filename or "document")[-1]
    filename = re.sub(r"[\x00-\x1f\x7f]", "", filename).strip()[:200]
    return filename or "document"


def storage_file(doc: Document) -> Path:
    root = settings.storage_path.resolve()
    candidate = (root / doc.storage_key).resolve()
    if not candidate.is_relative_to(root) or candidate == root:
        raise ApiError(404, "NOT_FOUND", "Document content unavailable.")
    return candidate


def read_document(doc: Document) -> bytes:
    try:
        path = storage_file(doc)
        with path.open("rb") as stream:
            content = stream.read(min(settings.max_upload_bytes, 20_971_520) + 1)
    except OSError:
        raise ApiError(
            503, "DEPENDENCY_UNAVAILABLE", "Private storage unavailable.", retryable=True
        ) from None
    if len(content) != doc.size_bytes or hashlib.sha256(content).hexdigest() != doc.sha256:
        raise ApiError(422, "FILE_REJECTED", "Stored document integrity check failed.")
    return content


def store_document(
    db, user, owner_kind, owner_id, document_type, filename, content, sharing_scope, mime="application/pdf"
) -> Document:
    """Internal storage primitive; citizen ownership/type checks belong to upload route."""
    digest = hashlib.sha256(content).hexdigest()
    doc = Document(
        id=new_id(),
        owner_kind=owner_kind,
        owner_id=owner_id,
        uploader_id=user.id,
        document_type=document_type,
        version=1,
        filename=safe_filename(filename),
        sha256=digest,
        storage_key=f"{digest[:2]}/{new_id()}-{digest}",
        mime=mime,
        size_bytes=len(content),
        sharing_scope=sharing_scope,
        uploaded_at=utcnow(),
    )
    try:
        path = storage_file(doc)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
    except OSError:
        raise ApiError(
            503, "DEPENDENCY_UNAVAILABLE", "Private storage unavailable.", retryable=True
        ) from None
    db.add(doc)
    db.flush()
    return doc


def document_owner(db, doc, user) -> bool:
    if doc.owner_kind == "USER":
        return doc.owner_id == user.id
    if doc.owner_kind == "LISTING":
        listing = db.get(Listing, doc.owner_id)
        return listing is not None and listing.seller_id == user.id
    if doc.owner_kind == "TRANSACTION":
        tx = db.get(Transaction, doc.owner_id)
        return tx is not None and user.id in {tx.seller_id, tx.buyer_id} and doc.uploader_id == user.id
    return False


def _transaction_officer(db, tx, user) -> bool:
    if "REGISTRAR" in user.roles and tx.assigned_registrar_id == user.id:
        return True
    if "REVIEWER" in user.roles:
        listing = db.get(Listing, tx.listing_id)
        if listing and listing.assigned_reviewer_id == user.id:
            return True
        for model, case_id in ((CancellationCase, tx.cancellation_case_id), (HoldCase, tx.hold_case_id)):
            case = db.get(model, case_id) if case_id else None
            if case and case.assigned_reviewer_id == user.id:
                return True
    return False


def authorized_document(db, doc, user):
    if document_owner(db, doc, user):
        return doc
    if doc.owner_kind == "USER" and doc.document_type == "IDENTITY":
        if "REVIEWER" in user.roles:
            submissions = db.scalars(
                select(IdentitySubmission).where(
                    IdentitySubmission.user_id == doc.owner_id,
                    IdentitySubmission.assigned_reviewer_id == user.id,
                )
            ).all()
            if any(doc.id in submission.document_ids for submission in submissions):
                return doc
    elif doc.owner_kind == "LISTING":
        listing = db.get(Listing, doc.owner_id)
        if listing and "REVIEWER" in user.roles and listing.assigned_reviewer_id == user.id:
            return doc
        if listing:
            for tx in db.scalars(select(Transaction).where(Transaction.listing_id == listing.id)).all():
                if _transaction_officer(db, tx, user) or (
                    doc.sharing_scope == "TRANSACTION_PARTIES_AND_OFFICERS"
                    and user.id in {tx.seller_id, tx.buyer_id}
                ):
                    return doc
    elif doc.owner_kind == "TRANSACTION":
        tx = db.get(Transaction, doc.owner_id)
        if tx and (
            _transaction_officer(db, tx, user)
            or (
                doc.sharing_scope == "TRANSACTION_PARTIES_AND_OFFICERS"
                and user.id in {tx.seller_id, tx.buyer_id}
            )
        ):
            return doc
    # USER supporting evidence is shared only through an explicitly linked case.
    if doc.document_type == "SUPPORTING_EVIDENCE":
        for model in (CancellationCase, HoldCase):
            for case in db.scalars(select(model)).all():
                linked_ids = list(case.evidence_document_ids or [])
                for response in getattr(case, "responses", None) or []:
                    linked_ids.extend(response.get("evidence_document_ids", []))
                if doc.id not in linked_ids:
                    continue
                tx = db.get(Transaction, case.transaction_id) if case.transaction_id else None
                if "REVIEWER" in user.roles and case.assigned_reviewer_id == user.id:
                    return doc
                if (
                    tx
                    and doc.sharing_scope == "TRANSACTION_PARTIES_AND_OFFICERS"
                    and user.id in {tx.seller_id, tx.buyer_id}
                ):
                    return doc
    raise ApiError(404, "NOT_FOUND", "Document not visible.")


def _b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def issue_download(request, user, kind, resource_id) -> dict:
    kind = "report" if kind in {"report", "TRANSACTION_REPORT"} else kind.lower()
    if kind not in {"document", "report"}:
        raise ValueError("Unsupported download kind.")
    expires = utcnow() + timedelta(seconds=DOWNLOAD_TTL)
    body = _b64(
        json.dumps(
            {"user": user.id, "kind": kind, "resource": resource_id, "exp": int(expires.timestamp())},
            separators=(",", ":"),
        ).encode()
    )
    signature = _b64(
        hmac.new(settings.session_secret.encode(), b"download:" + body.encode(), hashlib.sha256).digest()
    )
    return {
        "download_url": str(request.base_url).rstrip("/") + f"/api/v1/downloads/{body}.{signature}",
        "expires_at": iso_utc(expires),
    }


def decode_download(token, user):
    try:
        if len(token) > 1200:
            raise ValueError()
        body, signature = token.split(".")
        expected = _b64(
            hmac.new(settings.session_secret.encode(), b"download:" + body.encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError()
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if (
            data["user"] != user.id
            or data["exp"] <= utcnow().timestamp()
            or data["kind"] not in {"document", "report"}
        ):
            raise ValueError()
        return data
    except (ValueError, KeyError, TypeError):
        raise ApiError(404, "NOT_FOUND", "Download expired or not visible.") from None


if __name__ == "__main__":
    try:
        print(json.dumps(_inspect(sys.stdin.buffer.read(min(settings.max_upload_bytes, 20_971_520) + 1))))
    except Exception:
        sys.exit(1)
