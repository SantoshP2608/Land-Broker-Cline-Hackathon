"""Self-owned synthetic identity submissions, never automatic confirmation."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, success
from app.core.security import current_user
from app.db import get_db
from app.domain import iso_utc
from app.models import Document, IdentitySubmission, User, utcnow
from app.services.common import assigned_user, audit, command, get_or_404

router = APIRouter(tags=["identity"])


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    consent: bool = Field(strict=True)
    document_ids: list[UUID] = Field(min_length=1, max_length=10)


def identity_dto(submission):
    if submission is None:
        return None
    return {
        "id": submission.id,
        "user_id": submission.user_id,
        "version": submission.version,
        "status": submission.status,
        "consent_at": iso_utc(submission.consent_at),
        "document_ids": submission.document_ids,
        "mode": submission.mode,
        "reason": submission.reason,
    }


@router.get("/identity/me")
def me(request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    submission = db.scalar(
        select(IdentitySubmission)
        .where(IdentitySubmission.user_id == user.id)
        .order_by(IdentitySubmission.created_at.desc(), IdentitySubmission.id.desc())
    )
    return success(request, identity_dto(submission))


@router.post("/identity/submissions", status_code=201)
def submit(body: Submission, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    def run():
        if not body.consent:
            raise ApiError(
                422, "VALIDATION_ERROR", "Explicit consent for synthetic identity review is required."
            )
        owner = db.scalar(
            select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)
        )
        latest = db.scalar(
            select(IdentitySubmission)
            .where(IdentitySubmission.user_id == user.id)
            .order_by(IdentitySubmission.created_at.desc(), IdentitySubmission.id.desc())
        )
        if owner.identity_status == "CONFIRMED" or (
            latest and latest.status == "PENDING" and latest.reason is None
        ):
            raise ApiError(409, "INVALID_TRANSITION", "Identity is confirmed or already awaiting review.")
        ids = list(dict.fromkeys(str(value) for value in body.document_ids))
        for id in ids:
            doc = get_or_404(db, Document, id)
            if (
                doc.owner_kind != "USER"
                or doc.owner_id != user.id
                or doc.uploader_id != user.id
                or doc.document_type != "IDENTITY"
                or doc.sharing_scope != "OWNER_AND_OFFICERS"
            ):
                raise ApiError(
                    422, "VALIDATION_ERROR", "Only your private identity documents may be submitted."
                )
        submission = IdentitySubmission(
            user_id=user.id,
            status="PENDING",
            consent_at=utcnow(),
            document_ids=ids,
            mode="SIMULATED",
            assigned_reviewer_id=assigned_user(db, "REVIEWER"),
        )
        db.add(submission)
        owner.identity_status = "PENDING"
        owner.identity_mode = "SIMULATED"
        db.flush()
        audit(
            db,
            user,
            submission,
            "IDENTITY_SUBMITTED",
            None,
            "PENDING",
            recipients=[submission.assigned_reviewer_id],
        )
        return identity_dto(submission)

    return command(request, db, user, body.model_dump(mode="json"), run, 201)
