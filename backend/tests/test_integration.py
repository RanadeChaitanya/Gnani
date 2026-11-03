"""Full room flow over real WebSockets: live uvicorn + fake Gnani server (spec §14.2)."""
import asyncio
import json
import math
import time
from typing import Any

import httpx
import websockets

from app.config import get_settings
from app.gnani.stt_client import GnaniStream, build_headers
from app.notice import NOTICE_VERSION
from fake_gnani_server import FakeGnani

LOUD = b"".join(int(8000 * math.sin(2 * math.pi * 300 * i / 16000)).to_bytes(2, "little", signed=True)
                for i in range(512))
QUIET = bytes(1024)


class Listener:
    """Collects /ws/room events in the background."""

    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    async def run(self, base: str, code: str, token: str) -> None:
        async with websockets.connect(f"ws://{base}/ws/room/{code}") as ws:
            await ws.send(json.dumps({"type": "auth", "token": token}))
            async for m in ws:
                self.events.append(json.loads(m))

    def of(self, kind: str) -> list[dict[str, Any]]:
        return [e for e in self.events if e["type"] == kind]


async def wait_for(pred: Any, timeout: float = 8.0) -> None:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if pred():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("timed out waiting for condition")


async def setup_room(base: str, c: httpx.AsyncClient) -> tuple[str, dict[str, Any], dict[str, Any]]:
    host = (await c.post(f"http://{base}/api/rooms", json={"display_name": "Asha", "lang_code": "en-IN"})).json()
    code = host["room_code"]
    guest = (await c.post(f"http://{base}/api/rooms/{code}/join",
                          json={"display_name": "Ravi", "lang_code": "mr-IN"})).json()
    for p in (host, guest):
        await c.post(f"http://{base}/api/rooms/{code}/consent", headers={"Authorization": f"Bearer {p['token']}"},
                     json={"action": "grant", "notice_version": NOTICE_VERSION})
    r = await c.post(f"http://{base}/api/rooms/{code}/start", headers={"Authorization": f"Bearer {host['token']}"})
    assert r.json() == {"status": "active"}
    return code, host, guest


async def open_stt(base: str, code: str, token: str) -> tuple[Any, list[dict[str, Any]]]:
    ws = await websockets.connect(f"ws://{base}/ws/stt/{code}")
    await ws.send(json.dumps({"type": "auth", "token": token}))
    await ws.send(json.dumps({"type": "start", "sample_rate": 16000, "client_ts": 0}))
    got: list[dict[str, Any]] = []

    async def reader() -> None:
        try:
            async for m in ws:
                got.append(json.loads(m))
        except websockets.ConnectionClosed:
            pass

    asyncio.ensure_future(reader())
    await wait_for(lambda: any(m["type"] in ("ready", "stopped") for m in got))
    return ws, got


async def speak(ws: Any, utterances: int = 1, loud: int = 20, quiet: int = 26) -> None:
    """Real-time cadence: `loud` speech frames then enough silence for the fake VAD (700 ms) to close."""
    t0 = time.perf_counter()
    n = 0
    for _ in range(utterances):
        for frame in [LOUD] * loud + [QUIET] * quiet:
            await asyncio.sleep(max(0, t0 + n * 0.032 - time.perf_counter()))
            try:
                await ws.send(frame)
            except websockets.ConnectionClosed:
                return
            n += 1


def H(p: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {p['token']}"}


async def test_two_speakers_ordered_captions_and_notes(server: str, fake: FakeGnani) -> None:
    fake.scripts = {"en-IN": __import__("collections").deque(["Namaste, do kilo atta chahiye", "Aur ek litre tel"]),
                    "mr-IN": __import__("collections").deque(["हो, ₹२५० होतील"])}
    async with httpx.AsyncClient() as c:
        code, host, guest = await setup_room(server, c)
        la, lb = Listener(), Listener()
        tasks = [asyncio.ensure_future(la.run(server, code, host["token"])),
                 asyncio.ensure_future(lb.run(server, code, guest["token"]))]
        a, got_a = await open_stt(server, code, host["token"])
        b, got_b = await open_stt(server, code, guest["token"])
        assert got_a[-1]["type"] == "ready" and got_b[-1]["type"] == "ready"
        await speak(a)          # host utterance 1
        await speak(b)          # guest reply
        await speak(a)          # host utterance 2
        await wait_for(lambda: len(la.of("segment")) == 3 and len(lb.of("segment")) == 3)
        for lst in (la, lb):
            segs = lst.of("segment")
            assert [s["seq"] for s in segs] == [1, 2, 3]
            assert [s["name"] for s in segs] == ["Asha", "Ravi", "Asha"]
            assert segs[1]["text"] == "हो, ₹२५० होतील"
            assert not any(s["possible_echo"] for s in segs)
        assert [m["text"] for m in got_a if m["type"] == "transcript"][0].startswith("Namaste")
        # live word-by-word partials reach both phones; finals arrive as final_transcript upstream
        assert any(e["participant_id"] == guest["participant_id"] for e in la.of("partial"))
        assert any(e["participant_id"] == host["participant_id"] for e in lb.of("partial"))
        assert fake.headers_seen[0].get("x-partials") == "true"
        # headers reached the upstream exactly as specified
        assert {h["lang_code"] for h in fake.headers_seen} == {"en-IN", "mr-IN"}
        assert fake.bad_frames == 0

        r = await c.post(f"http://{server}/api/rooms/{code}/notes/quick", headers=H(host))
        assert r.json()["status"] == "pending"
        await wait_for(lambda: la.of("note_ready") and lb.of("note_ready"))
        note = la.of("note_ready")[0]["note"]
        assert note["status"] == "ready" and note["kind"] == "quick" and len(note["transcript"]) == 3
        assert note["faithfulness"]["flag_count"] == 0

        r = await c.post(f"http://{server}/api/rooms/{code}/end", headers=H(guest))
        assert r.json()["status"] == "ended" and r.json()["final_note_id"]
        await wait_for(lambda: len(la.of("note_ready")) == 2)
        assert any(m["type"] == "stopped" and m["reason"] == "room_ended" for m in got_a)
        got = (await c.get(f"http://{server}/api/notes/{r.json()['final_note_id']}", headers=H(host))).json()
        assert got["kind"] == "final" and got["note"]["title"]

        # both people confirm before the note is final; a correction regenerates it and asks both again
        nid = got["id"]
        rv = f"http://{server}/api/rooms/{code}/notes/{nid}/review"
        assert (await c.post(rv, headers=H(host), json={"action": "confirm"})).json()["review"]["final"] is False
        assert (await c.post(rv, headers=H(guest), json={"action": "confirm"})).json()["review"]["final"] is True
        r = (await c.post(rv, headers=H(guest), json={"action": "correct", "text": "Atta is 3 kg"})).json()
        assert r["status"] == "pending" and r["review"]["final"] is False
        await wait_for(lambda: any(e["note"]["id"] == nid and e["note"]["status"] == "ready"
                                   and e["note"]["review"]["corrections"] for e in la.of("note_ready")))
        last = [e["note"] for e in la.of("note_ready") if e["note"]["id"] == nid][-1]
        assert last["review"]["corrections"] == [{"name": "Ravi", "text": "Atta is 3 kg"}]
        assert set(last["review"]["by"].values()) == {"pending"}

        assert (await c.delete(f"http://{server}/api/rooms/{code}/data", headers=H(host))).json() == {"deleted": True}
        await wait_for(lambda: la.of("data_deleted"))
        assert (await c.get(f"http://{server}/api/rooms/{code}/notes", headers=H(host))).json() == []
        for t in tasks:
            t.cancel()


async def test_revoke_stops_capture_for_everyone(server: str, fake: FakeGnani) -> None:
    async with httpx.AsyncClient() as c:
        code, host, guest = await setup_room(server, c)
        a, got_a = await open_stt(server, code, host["token"])
        b, got_b = await open_stt(server, code, guest["token"])
        t = time.monotonic()
        await c.post(f"http://{server}/api/rooms/{code}/consent", headers=H(guest),
                     json={"action": "revoke", "notice_version": NOTICE_VERSION})
        stopped = lambda got: any(m["type"] == "stopped" and m["reason"] == "consent_revoked" for m in got)  # noqa: E731
        await wait_for(lambda: stopped(got_a) and stopped(got_b), timeout=1.0)
        assert time.monotonic() - t < 1.0
        # and nobody can reopen capture without fresh consent
        _, again = await open_stt(server, code, host["token"])
        assert any(m.get("code") == "not_capturing" for m in again)


async def test_stt_denied_without_consent(server: str, fake: FakeGnani) -> None:
    async with httpx.AsyncClient() as c:
        host = (await c.post(f"http://{server}/api/rooms", json={"display_name": "A", "solo": True})).json()
        _, got = await open_stt(server, host["room_code"], host["token"])
        assert any(m.get("code") == "not_capturing" for m in got) and fake.total_connections == 0


async def test_upstream_drop_reconnects_then_fails_visibly(server: str, fake: FakeGnani) -> None:
    async with httpx.AsyncClient() as c:
        code, host, _ = await setup_room(server, c)
        a, got = await open_stt(server, code, host["token"])
        await fake.drop_all()
        await wait_for(lambda: [m.get("state") for m in got if m["type"] == "upstream_status"][-2:]
                       == ["reconnecting", "connected"])
        await speak(a)
        await wait_for(lambda: any(m["type"] == "transcript" for m in got))
        await fake.stop()  # service gone: 3 retries then a visible failure
        await fake.drop_all()
        await wait_for(lambda: any(m.get("state") == "failed" for m in got), timeout=10)


async def test_concurrency_limit_shows_failure(server: str, fake: FakeGnani) -> None:
    fake.max_connections = 1
    async with httpx.AsyncClient() as c:
        code, host, guest = await setup_room(server, c)
        _, got_a = await open_stt(server, code, host["token"])
        _, got_b = await open_stt(server, code, guest["token"])
        assert got_a[-1]["type"] == "ready"
        assert any(m.get("state") == "failed" for m in got_b)


async def test_budget_guard(server: str, fake: FakeGnani) -> None:
    get_settings().max_stt_seconds_per_room = 1.5
    try:
        async with httpx.AsyncClient() as c:
            code, host, _ = await setup_room(server, c)
            a, got = await open_stt(server, code, host["token"])
            await speak(a, loud=40, quiet=40)
            await wait_for(lambda: any(m["type"] == "stopped" and m["reason"] == "budget" for m in got))
            r = await c.post(f"http://{server}/api/rooms/{code}/start", headers=H(host))
            assert r.status_code == 409
    finally:
        get_settings().max_stt_seconds_per_room = 1800


async def test_rotation_keeps_transcripts(fake: FakeGnani) -> None:
    """Scaled-down 13:00 / 14:45 / 14:58 schedule; the fake hard-closes sessions at 4 s (stand-in for 15:00).
    The speaker never pauses 1.5 s, so this exercises the hard path (rotate at end-of-speech)."""
    fake.close_after(4.0)
    events: list[dict[str, Any]] = []
    statuses: list[str] = []

    async def on_event(m: dict[str, Any]) -> None:
        events.append(m)

    async def on_status(m: dict[str, Any]) -> None:
        statuses.append(m["state"])

    s = GnaniStream(get_settings().stt_url, build_headers(get_settings(), "en-IN", []), on_event, on_status,
                    rotate_after_s=1.0, hard_rotate_s=2.0, force_rotate_s=3.8)
    await s.start()
    t0 = time.perf_counter()
    for i in range(6 * 46):  # ~8.8 s of audio = 6 utterances, spanning several rotations
        await asyncio.sleep(max(0, t0 + i * 0.032 - time.perf_counter()))
        s.push(LOUD if i % 46 < 20 else QUIET)
    await asyncio.sleep(1.0)
    await s.close()
    assert len([e for e in events if e["type"] == "transcript"]) == 6
    assert fake.total_connections >= 4
    assert "reconnecting" not in statuses  # rotations are planned, not reconnects


async def test_double_end_makes_one_note_and_preview(server: str, fake: FakeGnani) -> None:
    async with httpx.AsyncClient() as c:
        code, host, guest = await setup_room(server, c)
        pv = (await c.get(f"http://{server}/api/rooms/{code}/preview")).json()
        assert pv["host_name"] == "Asha" and pv["full"] is True and "participant" not in json.dumps(pv)
        a, _ = await open_stt(server, code, host["token"])
        await speak(a)
        await asyncio.sleep(2)
        r1, r2 = await asyncio.gather(c.post(f"http://{server}/api/rooms/{code}/end", headers=H(host)),
                                      c.post(f"http://{server}/api/rooms/{code}/end", headers=H(guest)))
        assert r1.json()["final_note_id"] == r2.json()["final_note_id"]
        notes = (await c.get(f"http://{server}/api/rooms/{code}/notes", headers=H(host))).json()
        assert len([n for n in notes if n["kind"] == "final"]) == 1


async def test_call_by_number_rings_the_other_phone(server: str, fake: FakeGnani) -> None:
    async with httpx.AsyncClient() as c:
        me = (await c.post(f"http://{server}/api/me", json={"phone": "98765 43210"})).json()
        ravi = (await c.post(f"http://{server}/api/me", json={"phone": "+91 91234-56789"})).json()
        assert ravi["phone"] == "+91 91234 56789"
        assert (await c.post(f"http://{server}/api/me", json={"phone": "12345"})).status_code == 422
        rings: list[dict[str, Any]] = []

        async def inbox() -> None:
            async with websockets.connect(f"ws://{server}/ws/inbox") as ws:
                await ws.send(json.dumps({"type": "auth", "token": ravi["device_token"]}))
                async for m in ws:
                    rings.append(json.loads(m))

        t = asyncio.ensure_future(inbox())
        await asyncio.sleep(0.5)
        dev = {"Authorization": f"Bearer {me['device_token']}"}
        call = (await c.post(f"http://{server}/api/calls", headers=dev,
                             json={"to": "9123456789", "display_name": "Asha"})).json()
        assert call["ringing"] is True and call["role"] == "host"
        await wait_for(lambda: rings and rings[0]["type"] == "incoming")
        assert rings[0] == {"type": "incoming", "room_code": call["room_code"], "from_name": "Asha"}
        await c.post(f"http://{server}/api/rooms/{call['room_code']}/join", json={"display_name": "Ravi"})
        await wait_for(lambda: rings[-1]["type"] == "answered")
        # nobody's phone open: the caller is told to send an invite link instead
        off = (await c.post(f"http://{server}/api/calls", headers=dev, json={"to": "8000000000", "display_name": "Asha"})).json()
        assert off["ringing"] is False
        assert (await c.post(f"http://{server}/api/calls", json={"to": "8000000000", "display_name": "A"})).status_code == 401
        assert (await c.post(f"http://{server}/api/calls", headers=dev,
                             json={"to": "9876543210", "display_name": "A"})).status_code == 422
        t.cancel()
