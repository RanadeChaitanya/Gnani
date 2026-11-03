"""Call by mobile number: a phone registers its number once; callers ring it while Saar is open on it.
Numbers are kept only as keyed hashes, in memory (never in the DB or logs)."""
import asyncio
import hashlib
import hmac
import json
import re
import time
from typing import Any, Literal

import jwt
from fastapi import APIRouter, Depends, Header, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from ..config import get_settings
from ..schemas import CreateRoomRequest, LangCode
from ..ws.room_hub import get_hub
from .rooms import ApiError, _participants, _rate_limit, _room, create_room

router = APIRouter(prefix="/api")
DEVICE_TTL_S = 30 * 24 * 3600
_inbox: dict[str, set[WebSocket]] = {}  # number key -> open Saar tabs on that phone
_ringing: dict[str, str] = {}  # room code -> callee number key


def normalize_phone(raw: str) -> str | None:
    """Indian mobile numbers only → 91XXXXXXXXXX. shortcut: India-only, use libphonenumber for other countries."""
    d = re.sub(r"\D", "", raw)
    if len(d) == 11 and d.startswith("0"):
        d = d[1:]
    if len(d) == 10:
        d = "91" + d
    return d if len(d) == 12 and d.startswith("91") and d[2] in "6789" else None


def phone_key(phone: str) -> str:
    return hmac.new(get_settings().jwt_secret.encode(), phone.encode(), hashlib.sha256).hexdigest()[:32]


def _device(authorization: str = Header("")) -> str:
    try:
        p = jwt.decode(authorization.removeprefix("Bearer ").strip(), get_settings().jwt_secret, algorithms=["HS256"])
        return str(p["dev"])
    except (jwt.PyJWTError, KeyError):
        raise ApiError(401, "unauthorized", "Set up this phone again") from None


class MeRequest(BaseModel):
    phone: str = Field(max_length=20)


class CallRequest(BaseModel):
    to: str = Field(max_length=20)
    display_name: str = Field(min_length=1, max_length=40)
    lang_code: LangCode = "auto"
    notes_lang: Literal["en", "same", "hi"] = "en"


@router.post("/me", dependencies=[Depends(_rate_limit)])
async def register(req: MeRequest) -> dict[str, str]:
    """shortcut: the number is not verified by SMS OTP (no SMS provider); add OTP before real use."""
    phone = normalize_phone(req.phone)
    if not phone:
        raise ApiError(422, "bad_phone", "Enter a 10-digit Indian mobile number")
    token = jwt.encode({"dev": phone_key(phone), "exp": int(time.time()) + DEVICE_TTL_S},
                       get_settings().jwt_secret, algorithm="HS256")
    return {"device_token": token, "phone": f"+{phone[:2]} {phone[2:7]} {phone[7:]}"}


async def _push(key: str, event: dict[str, Any]) -> int:
    sent = 0
    for ws in list(_inbox.get(key, ())):
        try:
            await ws.send_text(json.dumps(event, ensure_ascii=False))
            sent += 1
        except Exception:
            _inbox.get(key, set()).discard(ws)
    return sent


@router.post("/calls", dependencies=[Depends(_rate_limit)])
async def place_call(req: CallRequest, me: str = Depends(_device)) -> dict[str, Any]:
    to = normalize_phone(req.to)
    if not to:
        raise ApiError(422, "bad_phone", "That doesn't look like an Indian mobile number")
    if phone_key(to) == me:
        raise ApiError(422, "self_call", "That is your own number")
    session = await create_room(CreateRoomRequest(display_name=req.display_name, lang_code=req.lang_code,
                                                  notes_lang=req.notes_lang))
    code = session["room_code"]
    _ringing[code] = phone_key(to)
    rang = await _push(_ringing[code], {"type": "incoming", "room_code": code, "from_name": req.display_name})
    return {**session, "ringing": rang > 0}


async def call_answered(code: str) -> None:
    """Called when the callee joins: stop ringing on their other tabs."""
    key = _ringing.pop(code, None)
    if key:
        await _push(key, {"type": "answered", "room_code": code})


@router.post("/calls/{code}/decline")
async def decline(code: str) -> dict[str, bool]:
    room = _room(code)
    if _ringing.pop(room.code, None) is None:
        return {"ok": False}
    await get_hub(room.code).broadcast({"type": "declined"})
    return {"ok": True}


@router.post("/calls/{code}/cancel")
async def cancel(code: str) -> dict[str, bool]:
    key = _ringing.pop(_room(code).code, None)
    if key:
        await _push(key, {"type": "cancelled", "room_code": code.upper()})
    return {"ok": bool(key)}


async def inbox_ws(ws: WebSocket) -> None:
    """Rings this phone. First message: {"type":"auth","token":<device token>}."""
    await ws.accept()
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), 10))
        key = _device("Bearer " + str(first.get("token", "")))
    except (ApiError, TimeoutError, ValueError, WebSocketDisconnect):
        await ws.close(code=4401)
        return
    _inbox.setdefault(key, set()).add(ws)
    try:
        for code, k in list(_ringing.items()):  # a call that started before this tab opened
            if k == key:
                room = _room(code)
                if room.status == "lobby":
                    host = await _host_name(room.id)
                    await ws.send_text(json.dumps({"type": "incoming", "room_code": code, "from_name": host}))
        while True:
            await ws.receive_text()  # pings
    except WebSocketDisconnect:
        pass
    finally:
        _inbox.get(key, set()).discard(ws)
        if not _inbox.get(key):
            _inbox.pop(key, None)


async def _host_name(room_id: str) -> str:
    return next((p.display_name for p in _participants(room_id) if p.role == "host"), "Someone")

