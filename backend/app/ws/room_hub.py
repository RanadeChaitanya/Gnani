"""Per-room in-memory pub/sub: event broadcast, reorder buffer, echo dedupe, live STT sessions (§8.4)."""
import asyncio
import json
import logging
import re
import time
import unicodedata
from collections import deque
from typing import Any, Protocol

from fastapi import WebSocket, WebSocketDisconnect
from rapidfuzz import fuzz
from sqlmodel import col, func, select

from ..config import get_settings
from ..db import session
from ..models import Participant, Room, Segment, Usage
from ..security import verify_token

log = logging.getLogger("saar.hub")
HOLD_S = 1.5
ECHO_WINDOW_S = 0.6
ECHO_SIMILARITY = 85


class SttSessionLike(Protocol):
    participant_id: str

    @property
    def audio_seconds(self) -> float: ...

    async def stop(self, reason: str) -> None: ...


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).casefold()
    return re.sub(r"[^\w\s]", " ", text)


class RoomHub:
    def __init__(self, code: str) -> None:
        self.code = code
        self.sockets: set[WebSocket] = set()
        self.buffer: list[dict[str, Any]] = []
        self.recent: deque[dict[str, Any]] = deque(maxlen=20)
        self.next_seq = 1
        self.stt: dict[str, SttSessionLike] = {}
        self.levels: dict[str, float] = {}
        self.stt_failed = False
        self.usage_base = _db_usage_seconds(code)

    # ---- broadcast ----
    async def broadcast(self, event: dict[str, Any]) -> None:
        data = json.dumps(event, ensure_ascii=False)
        for ws in list(self.sockets):
            try:
                await ws.send_text(data)
            except Exception:
                self.sockets.discard(ws)

    # ---- usage ----
    def usage_seconds(self) -> float:
        return self.usage_base + sum(s.audio_seconds for s in self.stt.values())

    async def stop_capture(self, reason: str, by: str | None = None) -> None:
        """Stop every live STT session in this room and tell all clients."""
        sessions = list(self.stt.values())
        self.stt.clear()
        await asyncio.gather(*(s.stop(reason) for s in sessions), return_exceptions=True)
        await self.broadcast({"type": "capture_state", "active": False, "reason": reason, "by": by})

    # ---- segments: reorder + echo dedupe ----
    def add_segment(self, seg: dict[str, Any], hold_s: float = HOLD_S) -> None:
        seg["_hold_until"] = time.monotonic() + hold_s
        self.buffer.append(seg)
        asyncio.get_running_loop().call_later(hold_s + 0.01, lambda: asyncio.ensure_future(self.flush()))

    async def flush(self, force: bool = False) -> None:
        now = time.monotonic()
        due = [s for s in self.buffer if force or s["_hold_until"] <= now]
        if not due:
            return
        # also release anything that started before the newest due segment, so it is not emitted after it
        horizon = max(s["started_at"] for s in due)
        out = sorted((s for s in self.buffer if s in due or s["started_at"] <= horizon), key=lambda s: s["started_at"])
        self.buffer = [s for s in self.buffer if s not in out]
        for seg in out:
            seg.pop("_hold_until", None)
            seg["seq"] = self.next_seq
            self.next_seq += 1
            seg["possible_echo"] = get_settings().echo_dedupe and self._is_echo(seg)
            self.recent.append(seg)
            with session() as s:
                row = s.get(Segment, seg["id"])
                if row:
                    row.seq, row.possible_echo = seg["seq"], seg["possible_echo"]
                    s.add(row)
                    s.commit()
            await self.broadcast({"type": "segment", **{k: v for k, v in seg.items() if k != "id"}})

    def _is_echo(self, seg: dict[str, Any]) -> bool:
        # shortcut: only the segment being flushed can be marked; if the earlier one was the echo it stays visible
        for other in self.recent:
            if other["participant_id"] == seg["participant_id"] or other.get("possible_echo"):
                continue
            overlaps = (seg["started_at"] <= other["ended_at"] + ECHO_WINDOW_S
                        and other["started_at"] <= seg["ended_at"] + ECHO_WINDOW_S)
            if overlaps and fuzz.token_set_ratio(_norm(seg["text"]), _norm(other["text"])) >= ECHO_SIMILARITY:
                mine = self.levels.get(seg["participant_id"])
                theirs = self.levels.get(other["participant_id"])
                if mine is None or theirs is None or mine <= theirs:
                    return True
        return False


hubs: dict[str, RoomHub] = {}


def get_hub(code: str) -> RoomHub:
    if code not in hubs:
        hubs[code] = RoomHub(code)
    return hubs[code]


def _db_usage_seconds(code: str) -> float:
    with session() as s:
        room = s.exec(select(Room).where(Room.code == code)).first()
        if not room:
            return 0.0
        total = s.exec(select(func.sum(Usage.stt_audio_seconds)).where(Usage.room_id == room.id)).one()
        return float(total or 0.0)


def room_state(room: Room) -> dict[str, Any]:
    with session() as s:
        parts = s.exec(select(Participant).where(Participant.room_id == room.id)
                       .order_by(col(Participant.joined_at))).all()
    return {
        "status": room.status,
        "participants": [{"id": p.id, "name": p.display_name, "role": p.role, "lang_code": p.lang_code,
                          "consent": p.consent} for p in parts],
        "all_consented": bool(parts) and all(p.consent == "granted" for p in parts),
        "started_at": room.started_at.isoformat() if room.started_at else None,
        "solo": room.solo,
    }


async def room_ws(ws: WebSocket, code: str) -> None:
    """WS /ws/room/{code}: first message must be {"type":"auth","token":...}."""
    await ws.accept()
    try:
        msg = json.loads(await asyncio.wait_for(ws.receive_text(), 10))
        claims = verify_token(msg.get("token", "")) if msg.get("type") == "auth" else None
        with session() as s:
            room = s.exec(select(Room).where(Room.code == code)).first()
        if not claims or not room or claims.room_id != room.id:
            await ws.send_json({"type": "error", "code": "unauthorized", "message": "Invalid room token"})
            await ws.close(4401)
            return
        hub = get_hub(code)
        hub.sockets.add(ws)
        await ws.send_json({"type": "room_state", **room_state(room)})
        await ws.send_json({"type": "capture_state", "active": room.status == "active"})
        while True:
            m = json.loads(await ws.receive_text())
            if m.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except (WebSocketDisconnect, asyncio.TimeoutError, json.JSONDecodeError, RuntimeError):
        pass
    finally:
        if code in hubs:
            hubs[code].sockets.discard(ws)
