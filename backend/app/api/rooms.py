"""Rooms, consent state machine, notes and server-side delete (§8.1, §9.1). Server enforces every transition."""
import json
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, Header, Request
from sqlmodel import col, delete, func, select

from ..call_audio import create_credentials
from ..config import get_settings
from ..db import session
from ..models import Consent, Note, Participant, Room, Segment, now
from ..notice import NOTICE_VERSION, SHA256, notice_dict
from ..schemas import ConsentRequest, CreateRoomRequest, JoinRequest
from ..security import Claims, RateLimiter, issue_token, new_room_code, verify_token
from ..summarizer import service as notes
from ..ws.room_hub import get_hub, room_state

router = APIRouter(prefix="/api")
_limiter: RateLimiter | None = None
UNSTARTED_TTL = timedelta(hours=2)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status, self.code, self.message = status, code, message


def _rate_limit(request: Request) -> None:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(get_settings().rate_limit_per_min)
    if not _limiter.allow(request.client.host if request.client else "?"):
        raise ApiError(429, "rate_limited", "Too many requests, try again in a minute")


def _room(code: str) -> Room:
    with session() as s:
        room = s.exec(select(Room).where(Room.code == code.upper())).first()
    if not room:
        raise ApiError(404, "room_not_found", "No conversation with that code")
    return room


def auth(code: str, authorization: str = Header("")) -> tuple[Room, Claims]:
    claims = verify_token(authorization.removeprefix("Bearer ").strip())
    room = _room(code)
    if not claims or claims.room_id != room.id:
        raise ApiError(401, "unauthorized", "Invalid or expired room token")
    return room, claims


def _participants(room_id: str) -> list[Participant]:
    with session() as s:
        return list(s.exec(select(Participant).where(Participant.room_id == room_id)
                           .order_by(col(Participant.joined_at))).all())


def _add_participant(room: Room, req: JoinRequest, role: str) -> dict[str, Any]:
    p = Participant(room_id=room.id, display_name=req.display_name, role=role, lang_code=req.lang_code,
                    notes_lang=req.notes_lang, bias_words_json=json.dumps(req.bias_words, ensure_ascii=False))
    with session() as s:
        s.add(p)
        if role == "host":
            room.host_participant_id = p.id
            s.add(room)
        s.commit()
    return {"room_code": room.code, "participant_id": p.id, "token": issue_token(room.id, p.id, role),
            "role": role, "solo": room.solo, "call": None if room.solo else create_credentials(room.code, p.id, p.display_name),
            "notice": notice_dict()}


@router.post("/rooms", dependencies=[Depends(_rate_limit)])
async def create_room(req: CreateRoomRequest) -> dict[str, Any]:
    with session() as s:
        while True:
            code = new_room_code()
            if not s.exec(select(Room).where(Room.code == code)).first():
                break
        room = Room(code=code, solo=req.solo, scenario=req.scenario, notice_version=NOTICE_VERSION,
                    demo_mode=get_settings().demo_mode)
        s.add(room)
        s.commit()
    return _add_participant(room, req, "host")


@router.post("/rooms/{code}/join", dependencies=[Depends(_rate_limit)])
async def join_room(code: str, req: JoinRequest) -> dict[str, Any]:
    room = _room(code)
    if room.status == "ended" or (room.started_at is None and now() - room.created_at > UNSTARTED_TTL):
        raise ApiError(410, "room_expired", "This conversation has ended or expired")
    if room.solo or len(_participants(room.id)) >= 2:
        raise ApiError(409, "room_full", "This conversation already has two people")
    out = _add_participant(room, req, "guest")
    await get_hub(room.code).broadcast({"type": "room_state", **room_state(room)})
    return out


@router.get("/rooms/{code}/preview")
async def preview(code: str) -> dict[str, Any]:
    """Public, minimal: lets the join screen say who invited you. No transcript, no ids."""
    room = _room(code)
    parts = _participants(room.id)
    host = next((p for p in parts if p.role == "host"), None)
    return {"host_name": host.display_name if host else None, "scenario": room.scenario, "status": room.status,
            "full": room.solo or len(parts) >= 2, "notice": notice_dict()}


@router.get("/rooms/{code}")
async def get_room(ra: tuple[Room, Claims] = Depends(auth)) -> dict[str, Any]:
    return room_state(ra[0])


@router.post("/rooms/{code}/consent")
async def consent(req: ConsentRequest, ra: tuple[Room, Claims] = Depends(auth)) -> dict[str, str]:
    room, claims = ra
    if req.action == "grant" and req.notice_version != NOTICE_VERSION:
        raise ApiError(409, "stale_notice", "The consent notice has changed; please read it again")
    value = "granted" if req.action == "grant" else "revoked"
    with session() as s:
        p = s.get(Participant, claims.participant_id)
        assert p is not None
        p.consent = value
        s.add(p)
        s.add(Consent(room_id=room.id, participant_id=p.id, action=req.action,
                      notice_version=req.notice_version, notice_sha256=SHA256))
        if value == "revoked" and room.status == "active":
            room.status = "lobby"
            s.add(room)
        s.commit()
    hub = get_hub(room.code)
    if value == "revoked":
        await hub.stop_capture("consent_revoked", by=claims.participant_id)
    await hub.broadcast({"type": "consent_changed", "participant_id": claims.participant_id, "consent": value})
    await hub.broadcast({"type": "room_state", **room_state(room)})
    return {"consent": value}


@router.post("/rooms/{code}/start")
async def start(ra: tuple[Room, Claims] = Depends(auth)) -> dict[str, str]:
    room, claims = ra
    if claims.role != "host":
        raise ApiError(403, "host_only", "Only the host can start transcription")
    if room.status == "ended":
        raise ApiError(410, "room_expired", "This conversation has ended")
    if room.status == "active":
        return {"status": "active"}
    parts = _participants(room.id)
    if len(parts) < (1 if room.solo else 2) or not all(p.consent == "granted" for p in parts):
        raise ApiError(409, "not_all_consented", "Everyone must agree before transcription starts")
    hub = get_hub(room.code)
    if hub.usage_seconds() >= get_settings().max_stt_seconds_per_room:
        raise ApiError(409, "budget", "Transcription budget for this room is used up")
    with session() as s:
        room.status = "active"
        room.started_at = room.started_at or now()
        s.add(room)
        s.commit()
    await hub.broadcast({"type": "capture_state", "active": True})
    await hub.broadcast({"type": "room_state", **room_state(room)})
    return {"status": "active"}


def _segment_count(room_id: str) -> int:
    with session() as s:
        return int(s.exec(select(func.count()).select_from(Segment).where(Segment.room_id == room_id)).one())


@router.post("/rooms/{code}/end")
async def end(ra: tuple[Room, Claims] = Depends(auth)) -> dict[str, Any]:
    hub = get_hub(ra[0].code)
    async with hub.lock:  # both phones may press End at once: exactly one final note
        return await _end(ra[0].code)


async def _end(code: str) -> dict[str, Any]:
    room = _room(code)  # re-read inside the lock
    with session() as s:
        existing = s.exec(select(Note).where(Note.room_id == room.id, Note.kind == "final")).first()
    if room.status == "ended":
        return {"status": "ended", "final_note_id": existing.id if existing else None}
    hub = get_hub(room.code)
    await hub.stop_capture("room_ended")
    with session() as s:
        room.status, room.ended_at = "ended", now()
        s.add(room)
        s.commit()
    await hub.broadcast({"type": "room_state", **room_state(room)})
    await hub.flush(force=True)
    note_id = None
    if _segment_count(room.id):
        warning = "Transcription failed during the call; this note covers only what was captured." \
            if hub.stt_failed else ""
        note_id = notes.start_note(room, "final", warning).id
    return {"status": "ended", "final_note_id": note_id}


@router.post("/rooms/{code}/notes/quick")
async def quick_note(ra: tuple[Room, Claims] = Depends(auth)) -> dict[str, str]:
    room, _ = ra
    await get_hub(room.code).flush(force=True)
    if _segment_count(room.id) < 3:
        raise ApiError(422, "too_little_content", "Talk a little more before making a note")
    return {"note_id": notes.start_note(room, "quick").id, "status": "pending"}


@router.get("/rooms/{code}/notes")
async def list_notes(ra: tuple[Room, Claims] = Depends(auth)) -> list[dict[str, Any]]:
    with session() as s:
        rows = s.exec(select(Note).where(Note.room_id == ra[0].id).order_by(col(Note.created_at))).all()
    return [{"id": n.id, "kind": n.kind, "status": n.status, "created_at": n.created_at.isoformat()}
            for n in rows]


@router.get("/notes/{note_id}")
async def get_note(note_id: str, authorization: str = Header("")) -> dict[str, Any]:
    claims = verify_token(authorization.removeprefix("Bearer ").strip())
    with session() as s:
        note = s.get(Note, note_id)
        room = s.get(Room, note.room_id) if note else None
    if not note or not room or not claims or claims.room_id != room.id:
        raise ApiError(404, "note_not_found", "Note not found")
    return notes.note_payload(note, room)


@router.delete("/rooms/{code}/data")
async def delete_data(ra: tuple[Room, Claims] = Depends(auth)) -> dict[str, bool]:
    room, _ = ra
    hub = get_hub(room.code)
    await hub.stop_capture("data_deleted")
    hub.buffer.clear()
    hub.recent.clear()
    with session() as s:
        for table in (Segment, Note):
            s.exec(delete(table).where(col(table.room_id) == room.id))
        if room.status == "active":
            room.status = "lobby"
            s.add(room)
        s.commit()
    await hub.broadcast({"type": "data_deleted"})
    return {"deleted": True}
