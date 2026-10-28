"""Protocol-faithful fake of wss://api.vachana.ai/stt/v3/stream (spec Appendix A).

Run standalone for offline dev:  python scripts/fake_gnani_server.py --port 9001
then set GNANI_WS_URL_OVERRIDE=ws://127.0.0.1:9001/stt/v3/stream
"""
import argparse
import asyncio
import json
import time
import uuid
from array import array
from collections import deque
from datetime import datetime, timezone
from http import HTTPStatus
from typing import Any

from websockets.asyncio.server import ServerConnection, serve
from websockets.datastructures import Headers
from websockets.http11 import Request, Response


# Offline dev / e2e: distinct per-language lines so two fake speakers never look like echoes of each other.
DEMO_LINES = {
    "en-IN": ["Namaste, mujhe do kilo atta chahiye", "Aur ek litre sarson ka tel bhi", "Kal subah dus baje bhej dena"],
    "mr-IN": ["हो, ₹२५० होतील", "उद्या सकाळी दहा वाजता पाठवतो", "धन्यवाद, नमस्कार"],
    "hi-IN": ["जी, कल सुबह दस बजे का समय ठीक है", "डॉक्टर शर्मा से मिलना है", "धन्यवाद"],
}


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


class FakeGnani:
    def __init__(self, scripts: dict[str, list[str]] | None = None, *, latency_ms: int = 40,
                 max_connections: int | None = None, close_after: float | None = None,
                 energy: int = 500) -> None:
        self.scripts = {k: deque(v) for k, v in (scripts or {}).items()}
        self.latency_ms = latency_ms
        self.max_connections = max_connections
        self.close_after_s = close_after
        self.energy = energy
        self.active = 0
        self.total_connections = 0
        self.bad_frames = 0
        self.frame_times: list[float] = []
        self.headers_seen: list[dict[str, str]] = []
        self.transcripts_sent = 0
        self._error_next = False
        self._conns: set[ServerConnection] = set()

    # --- test hooks ---
    def inject_error(self) -> None:
        self._error_next = True

    def close_after(self, seconds: float | None) -> None:
        self.close_after_s = seconds

    async def drop_all(self) -> None:
        for c in list(self._conns):
            await c.close(1011, "injected drop")

    def _text(self, lang: str, n: int) -> str:
        q = self.scripts.get(lang) or self.scripts.get("default")
        if q:
            return q.popleft()
        lines = DEMO_LINES.get(lang)
        return lines[n % len(lines)] if lines else f"fake transcript {n}"

    def _process_request(self, conn: ServerConnection, req: Request) -> Response | None:
        def reject(status: HTTPStatus, msg: str) -> Response:
            return Response(status.value, status.phrase, Headers({"content-type": "text/plain"}), msg.encode())
        if not req.headers.get("x-api-key-id"):
            return reject(HTTPStatus.UNAUTHORIZED, "missing x-api-key-id")
        if not req.headers.get("lang_code"):
            return reject(HTTPStatus.BAD_REQUEST, "missing lang_code")
        if self.max_connections is not None and self.active >= self.max_connections:
            return reject(HTTPStatus.TOO_MANY_REQUESTS, "concurrent connection limit")
        return None

    async def _handler(self, ws: ServerConnection) -> None:
        assert ws.request is not None
        h = {k.lower(): v for k, v in ws.request.headers.raw_items()}
        self.headers_seen.append(h)
        self.active += 1
        self.total_connections += 1
        self._conns.add(ws)
        rate = int(h.get("x-sample-rate", "16000"))
        silence_frames = max(1, int(h.get("x-min-silence-ms", "500")) * rate // 512 // 1000)
        await ws.send(json.dumps({"type": "connected", "message": "STT service ready — VAD service connected",
                                  "timestamp": _ts(), "config": {"sample_rate": rate, "chunk_size": 512}}))
        opened = time.monotonic()
        speech = silence = 0
        index = 0
        try:
            while True:
                timeout = None
                if self.close_after_s is not None:
                    timeout = max(0.0, opened + self.close_after_s - time.monotonic())
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout)
                except TimeoutError:
                    await ws.close(1000, "session limit")
                    return
                if isinstance(msg, str):
                    ctl: dict[str, Any] = json.loads(msg)
                    if ctl.get("type") == "update_settings":
                        await ws.send(json.dumps({"type": "settings_updated", "timestamp": _ts(), "config": {
                            "language_code": h.get("lang_code"), "format": h.get("x-format", "verbatim"),
                            "bias_word_count": len((ctl.get("bias") or {}).get("list") or []),
                            "bias_score": (ctl.get("bias") or {}).get("score", 0.0)}}))
                    continue
                self.frame_times.append(time.monotonic())
                if len(msg) != 1024:
                    self.bad_frames += 1
                    await ws.send(json.dumps({"type": "error", "timestamp": _ts(),
                                              "message": f"frame must be 1024 bytes, got {len(msg)}"}))
                    continue
                if self._error_next:
                    self._error_next = False
                    await ws.send(json.dumps({"type": "error", "timestamp": _ts(), "message": "injected error"}))
                a = array("h", msg)
                loud = sum(x * x for x in a) / len(a) > self.energy**2
                if loud:
                    speech += 1
                    silence = 0
                elif speech:
                    silence += 1
                    if silence >= silence_frames:
                        dur = speech * 512 * 1000 // rate
                        speech = silence = 0
                        await ws.send(json.dumps({"type": "processing", "timestamp": _ts()}))
                        await asyncio.sleep(self.latency_ms / 1000)
                        await ws.send(json.dumps({
                            "type": "transcript", "timestamp": _ts(), "text": self._text(h["lang_code"], index),
                            "audio_duration_ms": dur, "segment_id": str(uuid.uuid4()), "segment_index": index,
                            "latency": self.latency_ms}))
                        self.transcripts_sent += 1
                        index += 1
        except Exception:
            pass
        finally:
            self.active -= 1
            self._conns.discard(ws)

    async def start(self, host: str = "127.0.0.1", port: int = 0) -> str:
        self._server = await serve(self._handler, host, port, process_request=self._process_request)
        sock = next(iter(self._server.sockets))
        return f"ws://{host}:{sock.getsockname()[1]}/stt/v3/stream"

    async def stop(self) -> None:
        self._server.close()
        await self._server.wait_closed()


async def _main(port: int) -> None:
    url = await FakeGnani().start(port=port)
    print(f"fake gnani listening on {url}", flush=True)
    await asyncio.Future()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9001)
    asyncio.run(_main(ap.parse_args().port))
