"""Purge server text data older than SERVER_RETENTION_HOURS (§8.6)."""
import asyncio
import logging
from datetime import datetime, timedelta

from sqlmodel import col, delete, or_, select

from .config import get_settings
from .db import session
from .models import Consent, Note, Participant, Room, Segment, Usage, now
from .ws.room_hub import hubs

log = logging.getLogger("saar.retention")


def purge(cutoff: datetime | None = None) -> int:
    """Delete rooms (and everything attached) created or ended before the cutoff. Returns rooms purged."""
    cutoff = cutoff or now() - timedelta(hours=get_settings().server_retention_hours)
    with session() as s:
        old = s.exec(select(Room).where(or_(col(Room.created_at) < cutoff,
                                            col(Room.ended_at) < cutoff))).all()
        ids = [r.id for r in old]
        if ids:
            for table in (Segment, Note, Consent, Usage, Participant):
                s.exec(delete(table).where(col(table.room_id).in_(ids)))
            s.exec(delete(Room).where(col(Room.id).in_(ids)))
            s.commit()
    for r in old:
        hubs.pop(r.code, None)
    return len(ids)


async def retention_loop(every_s: float = 600) -> None:
    while True:
        try:
            n = purge()
            if n:
                log.info("purged rooms", extra={"data": {"count": n}})
        except Exception:
            log.exception("retention purge failed")
        await asyncio.sleep(every_s)
