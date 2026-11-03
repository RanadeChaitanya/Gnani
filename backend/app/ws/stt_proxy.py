"""WS /ws/stt/{code}: one participant's own mic → Gnani, transcripts → client + room hub (§8.2, §9.2).

Audio is only ever held in the in-memory pacer queue (~3 s max); it is never written anywhere.
"""
import asyncio
import json
import logging
import time
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from sqlmodel import select

from ..config import get_settings
from ..db import session
from ..gnani.stt_client import FRAME_BYTES, GnaniStream, build_headers
from ..models import Participant, Room, Segment, Usage
from ..security import verify_token
from .room_hub import RoomHub, get_hub

log = logging.getLogger("saar.stt")
DIAG_KEYS = ("ctx", "track", "muted", "heals", "frames", "dropped", "hidden", "ua")


class SttSession:
    def __init__(self, ws: WebSocket, room: Room, p: Participant, hub: RoomHub) -> None:
        s = get_settings()
        self.ws, self.room, self.p, self.hub = ws, room, p, hub
        self.participant_id = p.id
        self.local_index = 0
        self.segments = 0
        self.bad_frames = 0
        self.pauses = 0
        self.client: dict[str, str] = {}
        self.stopped = False
        self._last_usage_push = 0.0
        with session() as db:  # both names help Prisma v3.0 spell them (capture starts only once both joined)
            names = [x.display_name for x in db.exec(select(Participant).where(Participant.room_id == room.id))]
        self.stream = GnaniStream(s.stt_url, build_headers(s, p.lang_code, json.loads(p.bias_words_json),
                                                           speaker_names=names),
                                  self._on_event, self._on_status)

    @property
    def audio_seconds(self) -> float:
        return self.stream.audio_seconds

    async def _send(self, msg: dict[str, Any]) -> None:
        try:
            await self.ws.send_json(msg)
        except Exception:
            pass

    async def _on_status(self, st: dict[str, Any]) -> None:
        if st["state"] == "failed":
            self.hub.stt_failed = True
        await self._send({"type": "upstream_status", **st})

    async def _on_event(self, msg: dict[str, Any]) -> None:
        kind = msg.get("type")
        if kind in ("processing", "speech_start"):  # both drive the "…speaking" indicator
            await self._send({"type": "processing"})
            await self.hub.broadcast({"type": "processing", "participant_id": self.p.id})
        elif kind in ("transcript", "partial_transcript"):
            text = (msg.get("text") or "").strip()
            if kind == "partial_transcript":
                await self.hub.broadcast({"type": "partial", "participant_id": self.p.id, "text": text})
                return
            if not text:
                return
            latency = int(msg.get("latency") or 0)
            dur = int(msg.get("audio_duration_ms") or 0)
            ended = time.time() - latency / 1000
            started = ended - dur / 1000
            self.local_index += 1
            self.segments += 1
            seg = Segment(room_id=self.room.id, participant_id=self.p.id,
                          upstream_segment_id=str(msg.get("segment_id") or f"{self.p.id}-{self.local_index}"),
                          local_index=self.local_index, text=text, started_at=started, ended_at=ended,
                          audio_ms=dur, latency_ms=latency)
            with session() as s:
                s.add(seg)
                s.commit()
            if get_settings().log_transcripts:
                log.debug("transcript", extra={"data": {"text": text}})
            await self._send({"type": "transcript", "text": text, "upstream_segment_id": seg.upstream_segment_id,
                              "local_index": seg.local_index, "audio_duration_ms": dur, "latency_ms": latency})
            self.hub.add_segment({
                "id": seg.id, "participant_id": self.p.id, "name": self.p.display_name, "text": text,
                "lang_code": msg.get("detected_language_code") or self.p.lang_code, "started_at": started, "ended_at": ended,
                "upstream_segment_id": seg.upstream_segment_id, "latency_ms": latency})
        elif kind == "error":
            log.warning("upstream error", extra={"data": {"participant": self.p.id}})
            await self._send({"type": "error", "code": "upstream_error", "message": str(msg.get("message", ""))})

    async def run(self) -> None:
        try:
            await self.stream.start()
        except Exception as e:
            log.warning("upstream connect failed", extra={"data": {"err": type(e).__name__}})
            await self._send({"type": "upstream_status", "state": "failed", "detail": "Could not reach speech service"})
            await self.stop("error")
            return
        await self._send({"type": "ready"})
        limit = get_settings().max_stt_seconds_per_room
        frames = 0
        while not self.stopped:
            m = await self.ws.receive()
            if m["type"] == "websocket.disconnect":
                break
            if (data := m.get("bytes")) is not None:
                if len(data) != FRAME_BYTES:
                    self.bad_frames += 1
                    continue
                self.stream.push(data)
                frames += 1
                if frames % 31 == 0:  # ~1 s
                    if self.hub.usage_seconds() >= limit:
                        with session() as s:
                            room = s.get(Room, self.room.id)
                            if room and room.status == "active":
                                room.status = "lobby"  # /start then refuses with `budget`
                                s.add(room)
                                s.commit()
                        await self.hub.stop_capture("budget")
                        break
                    if time.monotonic() - self._last_usage_push > 5:
                        self._last_usage_push = time.monotonic()
                        await self.hub.broadcast({"type": "usage", "stt_seconds_used": round(self.hub.usage_seconds(), 1),
                                                  "stt_seconds_limit": limit})
            elif (text := m.get("text")) is not None:
                ctl = json.loads(text)
                t = ctl.get("type")
                if t == "pause":
                    self.pauses += 1
                    await self.stream.pause()
                elif t == "resume":
                    await self.stream.resume()
                elif t == "level":
                    self.hub.levels[self.p.id] = float(ctl.get("rms", 0))
                elif t == "diag":  # phone-side mic state, logged at the end (small, no content)
                    self.client = {k: str(ctl.get(k))[:16] for k in DIAG_KEYS if k in ctl}
                elif t == "stop":
                    break
        await self.stop("client")

    async def stop(self, reason: str) -> None:
        if self.stopped:
            return
        self.stopped = True
        if self.hub.stt.get(self.p.id) is self:
            del self.hub.stt[self.p.id]
        seconds = self.stream.audio_seconds
        log.info("stt session ended", extra={"data": {"room": self.room.code, "role": self.p.role,
                                                      "lang": self.p.lang_code, "reason": reason, "segments": self.segments,
                                                      "bad_frames": self.bad_frames, "pauses": self.pauses,
                                                      "client": self.client, **self.stream.health()}})
        await self.stream.close()
        self.hub.usage_base += seconds
        with session() as s:
            s.add(Usage(room_id=self.room.id, participant_id=self.p.id, stt_audio_seconds=seconds,
                        stt_segments=self.segments, reconnects=self.stream.reconnects,
                        dropped_frames=self.stream.pacer.dropped + self.bad_frames))
            s.commit()
        await self._send({"type": "stopped", "reason": reason})
        try:
            await self.ws.close()
        except Exception:
            pass


async def stt_ws(ws: WebSocket, code: str) -> None:
    await ws.accept()

    async def deny(c: str, message: str) -> None:
        await ws.send_json({"type": "error", "code": c, "message": message})
        await ws.send_json({"type": "stopped", "reason": "error"})
        await ws.close(4403)

    try:
        auth = json.loads(await asyncio.wait_for(ws.receive_text(), 10))
        start = json.loads(await asyncio.wait_for(ws.receive_text(), 10))
    except (WebSocketDisconnect, asyncio.TimeoutError, json.JSONDecodeError, KeyError):
        await ws.close(4400)
        return
    claims = verify_token(auth.get("token", "")) if auth.get("type") == "auth" else None
    if not claims or start.get("type") != "start" or start.get("sample_rate") != 16000:
        return await deny("bad_request", "auth then start{sample_rate:16000} required")
    with session() as s:
        room = s.exec(select(Room).where(Room.code == code)).first()
        parts = s.exec(select(Participant).where(Participant.room_id == room.id)).all() if room else []
    me = next((p for p in parts if p.id == claims.participant_id), None)
    if not room or room.id != claims.room_id or not me:
        return await deny("unauthorized", "Invalid room token")
    if room.status != "active" or not all(p.consent == "granted" for p in parts):
        return await deny("not_capturing", "Capture is not active or consent is missing")
    hub = get_hub(code)
    if hub.usage_seconds() >= get_settings().max_stt_seconds_per_room:
        return await deny("budget", "Transcription budget for this room is used up")
    if old := hub.stt.get(me.id):
        await old.stop("client")  # a reconnecting client replaces its previous session
    sess = SttSession(ws, room, me, hub)
    hub.stt[me.id] = sess
    try:
        await sess.run()
    except (WebSocketDisconnect, RuntimeError):
        await sess.stop("client")
