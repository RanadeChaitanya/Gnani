"""Gnani Prisma realtime STT client: header builder, real-time pacer, rotating/reconnecting upstream.

Protocol (docs.gnani.ai/api/STT/stt-websocket.md): config via upgrade headers, binary 1,024-byte PCM
s16le frames at real-time cadence, JSON `connected`/`processing`/`transcript`/`error` back. 15-min cap.
"""
import asyncio
import json
import logging
import time
import unicodedata
from array import array
from collections import deque
from collections.abc import Awaitable, Callable
from typing import Any

import websockets
from websockets.asyncio.client import ClientConnection

from ..config import Settings

log = logging.getLogger("saar.gnani")

FRAME_BYTES = 1024
FRAME_S = 0.032  # 512 samples @ 16 kHz
BIAS_SCORES = {0.0, 0.5, 1.0, 1.5, 2.0}
SPEECH_RMS = 500  # int16 RMS above which a frame counts as "speech" for idle detection


def validate_bias_words(words: list[str]) -> list[str]:
    """Gnani silently ignores invalid boosting, so reject bad input up front."""
    words = [w.strip() for w in words if w.strip()]
    if len(words) > 100:
        raise ValueError("at most 100 bias words")
    for w in words:
        # letters incl. Indic combining marks (matras/virama are category M*, not L*)
        if not all(unicodedata.category(c)[0] in "LM" for c in w) or unicodedata.category(w[0])[0] != "L":
            raise ValueError(f"bias word must be a single word of letters only: {w!r}")
    return words


def build_headers(s: Settings, lang_code: str, bias_words: list[str], *, bias_score: float = 1.0,
                  sample_rate: int = 16000) -> dict[str, str]:
    """Upgrade headers for one participant's upstream connection (§7.1)."""
    if bias_score not in BIAS_SCORES:
        raise ValueError(f"bias_score must be one of {sorted(BIAS_SCORES)}")
    words = validate_bias_words(bias_words)
    h = {
        "x-api-key-id": s.gnani_api_key,
        "lang_code": lang_code,
        "x-sample-rate": str(sample_rate),
        "x-format": "verbatim" if words else s.stt_format_default,
        "itn_native_numerals": "false",
        "x-vad-threshold": str(s.stt_vad_threshold),
        "x-min-silence-ms": str(s.stt_min_silence_ms),
        "x-min-speech-ms": str(s.stt_min_speech_ms),
        "x-min-segment-ms": str(s.stt_min_segment_ms),
    }
    if s.stt_max_speech_s:
        h["x-max-speech-s"] = str(s.stt_max_speech_s)
    if words:
        h["x-bias-list"] = json.dumps(words, ensure_ascii=True)  # \uXXXX keeps headers ASCII
        h["x-bias-score"] = str(bias_score)
    if s.stt_partials:
        h["x-partials"] = "true"
    return h


class Pacer:
    """Sends queued frames at one per 32 ms; catches up at <=1.25x when backlog >10, drops oldest on overflow."""

    def __init__(self, send: Callable[[bytes], Awaitable[None]], *, frame_s: float = FRAME_S,
                 maxlen: int = 94, catchup_hi: int = 10, catchup_lo: int = 3, speedup: float = 1.25) -> None:
        self.send = send
        self.frame_s, self.hi, self.lo, self.speedup = frame_s, catchup_hi, catchup_lo, speedup
        self.q: deque[bytes] = deque(maxlen=maxlen)
        self.dropped = 0
        self._ev = asyncio.Event()
        self._catching = False

    def push(self, frame: bytes) -> None:
        if len(self.q) == self.q.maxlen:
            self.dropped += 1  # deque drops the oldest for us
        self.q.append(frame)
        self._ev.set()

    def clear(self) -> None:
        self.q.clear()

    async def run(self) -> None:
        next_t: float | None = None
        while True:
            if not self.q:
                self._ev.clear()
                await self._ev.wait()
                next_t = None  # fresh start after a gap: never burst to "catch up" silence
                continue
            now = time.monotonic()
            if next_t is None or next_t < now - self.frame_s:
                next_t = now
            if next_t > now:
                await asyncio.sleep(next_t - now)
            if not self.q:
                continue
            await self.send(self.q.popleft())
            depth = len(self.q)
            if depth > self.hi:
                self._catching = True
            elif depth <= self.lo:
                self._catching = False
            next_t += self.frame_s / self.speedup if self._catching else self.frame_s


EventCb = Callable[[dict[str, Any]], Awaitable[None]]


class GnaniStream:
    """One participant's upstream: pacer + rotation before the 15-min cap + reconnect with backoff."""

    def __init__(self, url: str, headers: dict[str, str], on_event: EventCb, on_status: EventCb, *,
                 rotate_after_s: float = 13 * 60, hard_rotate_s: float = 14 * 60 + 45,
                 force_rotate_s: float = 14 * 60 + 58,
                 backoff: tuple[float, ...] = (0.5, 1.0, 2.0), connect_timeout: float = 5.0) -> None:
        self.url, self.headers = url, headers
        self.on_event, self.on_status = on_event, on_status
        self.rotate_after_s, self.hard_rotate_s, self.force_rotate_s = rotate_after_s, hard_rotate_s, force_rotate_s
        self.backoff, self.connect_timeout = backoff, connect_timeout
        self.ws: ClientConnection | None = None
        self.opened_at = 0.0
        self.pending: dict[ClientConnection, int] = {}  # processing-without-transcript per socket
        self.last_speech = 0.0
        self.frames_sent = 0
        self.reconnects = 0
        self.paused = False
        self.failed = False
        self.closed = False
        self.pacer = Pacer(self._send_frame)
        self._tasks: set[asyncio.Task[None]] = set()
        self._lock = asyncio.Lock()
        self._rotating = False

    @property
    def audio_seconds(self) -> float:
        return self.frames_sent * FRAME_S

    def _spawn(self, coro: Awaitable[None]) -> None:
        t: asyncio.Task[None] = asyncio.ensure_future(coro)
        self._tasks.add(t)
        t.add_done_callback(self._tasks.discard)

    async def _open(self) -> ClientConnection:
        ws = await asyncio.wait_for(
            websockets.connect(self.url, additional_headers=self.headers, ping_interval=20, max_size=2**20),
            self.connect_timeout)
        first = json.loads(await asyncio.wait_for(ws.recv(), self.connect_timeout))
        if first.get("type") != "connected":
            await ws.close()
            raise ConnectionError(f"expected connected, got {first.get('type')}: {first.get('message', '')}")
        self.pending[ws] = 0
        self._spawn(self._reader(ws))
        return ws

    async def start(self) -> None:
        """Open the first upstream (raises on failure) and start pacer + supervisor."""
        await self.on_status({"state": "connecting"})
        self.ws = await self._open()
        self.opened_at = time.monotonic()
        await self.on_status({"state": "connected"})
        self._spawn(self.pacer.run())
        self._spawn(self._supervisor())

    def push(self, frame: bytes) -> None:
        if not self.paused and not self.failed:
            self.pacer.push(frame)

    async def pause(self) -> None:
        self.paused = True
        self.pacer.clear()

    async def resume(self) -> None:
        self.paused = False
        if self.ws is None and not self.failed:
            await self._reconnect()

    async def _send_frame(self, frame: bytes) -> None:
        ws = self.ws
        if ws is None:
            return
        try:
            await ws.send(frame)
        except websockets.ConnectionClosed:
            return  # reader notices and reconnects
        self.frames_sent += 1
        a = array("h", frame)
        if sum(x * x for x in a) / len(a) > SPEECH_RMS**2:
            self.last_speech = time.monotonic()

    async def _reader(self, ws: ClientConnection) -> None:
        try:
            async for raw in ws:
                if isinstance(raw, bytes):
                    continue
                msg = json.loads(raw)
                kind = msg.get("type")
                if kind == "final_transcript":  # with x-partials on, finals arrive under this name
                    msg["type"] = kind = "transcript"
                if kind in ("speech_start", "processing"):
                    self.pending[ws] = 1  # segment open (live API sends speech_start; docs describe processing)
                elif kind == "transcript":
                    self.pending[ws] = 0
                    # past the hard deadline: switch right after an utterance closes so none is split
                    if ws is self.ws and time.monotonic() - self.opened_at >= self.hard_rotate_s:
                        self._spawn(self.rotate())
                await self.on_event(msg)
        except websockets.ConnectionClosed:
            pass
        except Exception:
            log.exception("upstream reader error")
        finally:
            self.pending.pop(ws, None)
            if ws is self.ws and not self.closed:
                self.ws = None
                if not self.paused:
                    await self._reconnect()

    async def _reconnect(self) -> None:
        async with self._lock:
            if self.ws is not None or self.closed:
                return
            await self.on_status({"state": "reconnecting"})
            for delay in self.backoff:
                await asyncio.sleep(delay)
                try:
                    self.ws = await self._open()
                    self.opened_at = time.monotonic()
                    self.reconnects += 1
                    await self.on_status({"state": "connected"})
                    return
                except Exception as e:
                    log.warning("upstream reconnect failed", extra={"data": {"err": type(e).__name__}})
            self.failed = True
            self.pacer.clear()
            await self.on_status({"state": "failed", "detail": "Speech service unavailable"})

    async def _supervisor(self) -> None:
        while not self.closed:
            await asyncio.sleep(0.25)
            ws = self.ws
            if ws is None:
                continue
            now = time.monotonic()
            age = now - self.opened_at
            idle = self.pending.get(ws, 0) == 0 and now - self.last_speech >= 1.5
            if age >= self.force_rotate_s or (age >= self.rotate_after_s and idle):
                await self.rotate()

    async def rotate(self) -> None:
        """Open the new upstream first, switch the pacer target, then drain and close the old one."""
        old = self.ws
        if old is None or self._rotating:
            return
        self._rotating = True
        try:
            new = await self._open()
        except Exception:
            log.warning("rotation connect failed; will retry")
            return
        finally:
            self._rotating = False
        self.ws, self.opened_at = new, time.monotonic()
        self._spawn(self._drain_close(old))

    async def _drain_close(self, ws: ClientConnection, max_wait: float = 3.0) -> None:
        deadline = time.monotonic() + max_wait
        while self.pending.get(ws, 0) > 0 and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        await ws.close()

    async def close(self) -> None:
        self.closed = True
        ws, self.ws = self.ws, None
        if ws is not None:
            await ws.close()
        for t in list(self._tasks):
            t.cancel()
