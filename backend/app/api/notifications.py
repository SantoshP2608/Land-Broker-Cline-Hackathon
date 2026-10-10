from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, success
from app.core.security import current_user
from app.db import get_db
from app.models import Notification, utcnow
from app.services.common import command, get_or_404, iso, page

router = APIRouter(tags=["notifications"])


def dto(item):
    return {
        "id": item.id,
        "summary": item.summary,
        "link": item.link,
        "created_at": iso(item.created_at),
        "read_at": iso(item.read_at),
    }


@router.get("/notifications")
def notifications(
    request: Request,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=50),
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    items = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at, Notification.id)
    ).all()
    return success(request, page([dto(item) for item in items], cursor, limit))


@router.post("/notifications/{id}/read")
def mark_read(id: str, request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    def run():
        item = get_or_404(db, Notification, id)
        if item.user_id != user.id:
            raise ApiError(404, "NOT_FOUND", "Notification not visible.")
        if item.read_at is None:
            item.read_at = utcnow()
        return dto(item)

    return command(request, db, user, {}, run)
