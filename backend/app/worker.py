"""Cline document verification and durable outbox worker; deadlines never unlock land."""

import argparse
import logging
import time
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.db import SessionLocal
from app.models import CancellationCase, HoldCase, Notification, Outbox, User, utcnow
from app.services.verification import process_jobs

logger = logging.getLogger(__name__)


def process_outbox(db, limit=100):
    events = db.scalars(
        select(Outbox)
        .where(Outbox.completed_at.is_(None), Outbox.next_attempt_at <= utcnow())
        .order_by(Outbox.next_attempt_at, Outbox.id)
        .with_for_update(skip_locked=True)
        .limit(limit)
    ).all()
    ids = []
    for event in events:
        event.attempt += 1
        for recipient in set(event.recipients or []):
            if db.get(User, recipient) is None:
                continue
            values = {
                "user_id": recipient,
                "event_id": event.event_id,
                "summary": str(event.payload.get("summary", "Workflow update"))[:500],
                "link": "/" + str(event.payload.get("resource_id", "")),
                "created_at": utcnow(),
            }
            if db.bind.dialect.name == "postgresql":
                db.execute(
                    insert(Notification)
                    .values(**values)
                    .on_conflict_do_nothing(index_elements=["user_id", "event_id"])
                )
            elif (
                db.scalar(
                    select(Notification.id).where(
                        Notification.user_id == recipient, Notification.event_id == event.event_id
                    )
                )
                is None
            ):
                db.add(Notification(**values))
        event.completed_at = utcnow()
        ids.append(event.id)
    db.commit()
    return ids


def deadline_reminders(db):
    """One deduplicated reviewer reminder per deadline; no state transitions."""
    now = utcnow()
    created = []
    for model, statuses in (
        (CancellationCase, ["REQUESTED", "UNDER_REVIEW", "HOLD"]),
        (HoldCase, ["OPEN", "UNDER_REVIEW"]),
    ):
        cases = db.scalars(
            select(model)
            .where(model.status.in_(statuses), model.response_due_at <= now)
            .with_for_update(skip_locked=True)
        ).all()
        for case in cases:
            if not case.assigned_reviewer_id:
                continue
            event_id = str(
                uuid5(
                    NAMESPACE_URL,
                    f"deadline:{model.__tablename__}:{case.id}:{case.response_due_at.isoformat()}",
                )
            )
            if db.scalar(select(Outbox.id).where(Outbox.event_id == event_id)) is not None:
                continue
            db.add(
                Outbox(
                    event_id=event_id,
                    recipients=[case.assigned_reviewer_id],
                    payload={
                        "summary": "Response deadline elapsed - assigned review required; reservation retained",
                        "resource_id": case.id,
                    },
                    next_attempt_at=now,
                )
            )
            created.append(event_id)
    db.commit()
    return created


def run_once():
    with SessionLocal() as db:
        jobs = process_jobs(db)
        reminders = deadline_reminders(db)
        delivered = process_outbox(db)
        return {"verification_jobs": jobs, "deadline_reminders": reminders, "outbox": delivered}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=float, default=2.0)
    args = parser.parse_args()
    if args.interval <= 0:
        parser.error("--interval must be positive")
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            result = run_once()
            logger.info(
                "Worker completed jobs=%d outbox=%d reminders=%d",
                len(result["verification_jobs"]),
                len(result["outbox"]),
                len(result["deadline_reminders"]),
            )
        except Exception:
            # Never dump raw documents, token URLs, provider payloads or identity data.
            logger.error("Worker pass failed; durable jobs remain eligible for retry.")
            if args.once:
                raise SystemExit(1) from None
        if args.once:
            return
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
