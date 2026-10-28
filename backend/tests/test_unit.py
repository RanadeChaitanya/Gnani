import asyncio
import json
import logging
import statistics
import time
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import session
from app.gnani.stt_client import Pacer, build_headers, validate_bias_words
from app.logging import JsonFormatter, redact
from app.models import Room, Segment, now
from app.notice import NOTICE_VERSION
from app.retention import purge
from app.summarizer import faithfulness, service
from app.summarizer.schema import compute_costs
from app.summarizer.providers import MockProvider
from app.ws.room_hub import RoomHub

# ---------------- headers ----------------


def test_headers_default_transcribe() -> None:
    h = build_headers(get_settings(), "mr-IN", [])
    assert h["x-api-key-id"] == "test-key" and h["lang_code"] == "mr-IN" and h["x-sample-rate"] == "16000"
    assert h["x-format"] == "transcribe" and h["x-min-silence-ms"] == "700" and h["x-vad-threshold"] == "0.5"
    assert "x-bias-list" not in h and "x-max-speech-s" not in h


def test_headers_bias_escaped_and_verbatim() -> None:
    h = build_headers(get_settings(), "hi-IN", ["नमस्ते", "Vachana"])
    assert h["x-format"] == "verbatim" and h["x-bias-score"] == "1.0"
    assert h["x-bias-list"].isascii() and json.loads(h["x-bias-list"]) == ["नमस्ते", "Vachana"]


@pytest.mark.parametrize("words", [["two words"], ["abc1"], ["hi!"], ["x"] * 101])
def test_bias_rejects_invalid(words: list[str]) -> None:
    with pytest.raises(ValueError):
        validate_bias_words(words)


def test_bias_rejects_bad_score() -> None:
    with pytest.raises(ValueError):
        build_headers(get_settings(), "en-IN", ["Saar"], bias_score=0.7)


# ---------------- pacer ----------------


async def _run_pacer(p: Pacer, until: float) -> None:
    t = asyncio.create_task(p.run())
    await asyncio.sleep(until)
    t.cancel()


async def test_pacer_steady_cadence() -> None:
    sent: list[float] = []

    async def send(_: bytes) -> None:
        sent.append(time.perf_counter())

    p = Pacer(send)
    task = asyncio.create_task(p.run())
    start = time.perf_counter()
    for i in range(60):  # producer at real time, pushing one frame per 32 ms
        await asyncio.sleep(max(0, start + i * 0.032 - time.perf_counter()))
        p.push(bytes(1024))
    await asyncio.sleep(0.1)
    task.cancel()
    gaps = [b - a for a, b in zip(sent, sent[1:])]
    assert len(sent) == 60
    assert abs(statistics.mean(gaps) - 0.032) < 0.002
    # per-frame jitter is bounded by the OS timer: ±5 ms on Linux (prod); Windows' 15.6 ms tick can't meet it
    if __import__("sys").platform != "win32":
        assert max(abs(g - 0.032) for g in gaps) < 0.005


async def test_pacer_catchup_never_bursts() -> None:
    sent: list[float] = []

    async def send(_: bytes) -> None:
        sent.append(time.perf_counter())

    p = Pacer(send)
    for _ in range(40):
        p.push(bytes(1024))
    await _run_pacer(p, 1.3)
    gaps = [b - a for a, b in zip(sent, sent[1:])]
    total = sent[-1] - sent[0]
    assert len(sent) == 40
    assert total >= 39 * 0.032 / 1.25 - 0.01  # never faster than 1.25x on average
    assert total < 39 * 0.032  # but it did catch up
    if __import__("sys").platform != "win32":  # per-frame: no gap shorter than the 1.25x interval (−5 ms jitter)
        assert min(gaps) > 0.032 / 1.25 - 0.005


async def test_pacer_drops_oldest() -> None:
    out: list[bytes] = []

    async def send(b: bytes) -> None:
        out.append(b)

    p = Pacer(send, maxlen=94)
    for i in range(100):
        p.push(i.to_bytes(2, "little") * 512)
    assert p.dropped == 6 and len(p.q) == 94
    assert p.q[0] == (6).to_bytes(2, "little") * 512


# ---------------- reorder + echo ----------------


def _seg(pid: str, text: str, start: float, i: int) -> dict[str, object]:
    with session() as s:
        row = Segment(room_id="r", participant_id=pid, upstream_segment_id=f"u{i}", local_index=i, text=text,
                      started_at=start, ended_at=start + 1, audio_ms=1000, latency_ms=100)
        s.add(row)
        s.commit()
    return {"id": row.id, "participant_id": pid, "name": pid, "text": text, "lang_code": "en-IN",
            "started_at": start, "ended_at": start + 1, "upstream_segment_id": f"u{i}"}


async def test_reorder_buffer_sorts_and_holds() -> None:
    hub = RoomHub("TEST01")
    got: list[dict[str, object]] = []

    async def bc(e: dict[str, object]) -> None:
        got.append(e)

    hub.broadcast = bc  # type: ignore[method-assign]
    hub.add_segment(_seg("a", "second thing", 10.0, 1), hold_s=0.3)
    hub.add_segment(_seg("b", "first thing", 5.0, 2), hold_s=0.3)
    hub.add_segment(_seg("a", "third thing", 20.0, 3), hold_s=0.3)
    await asyncio.sleep(0.1)
    assert got == []  # still held
    await asyncio.sleep(0.4)
    assert [e["text"] for e in got] == ["first thing", "second thing", "third thing"]
    assert [e["seq"] for e in got] == [1, 2, 3]


async def test_echo_dedupe_marks_later_or_quieter() -> None:
    hub = RoomHub("TEST02")
    got: list[dict[str, object]] = []

    async def bc(e: dict[str, object]) -> None:
        got.append(e)

    hub.broadcast = bc  # type: ignore[method-assign]
    hub.add_segment(_seg("a", "Do kilo atta bhej dena", 1.0, 1), hold_s=0)
    await hub.flush(force=True)
    hub.add_segment(_seg("b", "do kilo atta bhej dena.", 1.3, 2), hold_s=0)
    hub.add_segment(_seg("b", "haan theek hai", 5.0, 3), hold_s=0)
    await hub.flush(force=True)
    assert [e["possible_echo"] for e in got] == [False, True, False]


# ---------------- faithfulness, totals, numbers (v2 schema) ----------------

SEGS = [{"seq": 1, "text": "Bhaiya do kilo atta aur ek litre tel, atta pachas rupaye kilo"},
        {"seq": 2, "text": "Tel ek sau chalis ka. Total do sau chalis hua. Ramesh Gandhi Nagar mein kal das baje dega"}]


def _note(**kw: object) -> dict[str, object]:
    n: dict[str, object] = {
        "title": "Atta and oil order", "note_language": "en", "conversation_type": "order",
        "summary": ["2 kg atta and 1 litre oil, total ₹240"],
        "parties": [{"name": "Ramesh", "role": "shopkeeper"}],
        "requirements": [{"text": "2 kg atta", "original": "do kilo atta", "evidence": [1]}],
        "items": [{"name": "atta", "quantity": 2, "unit": "kg", "unit_price": 50, "evidence": [1]},
                  {"name": "oil", "quantity": 1, "unit": "litre", "total_price": 140, "evidence": [2]}],
        "stated_totals": [{"amount": 240, "evidence": [2]}],
        "locations": [{"name": "Gandhi Nagar", "kind": "delivery", "evidence": [2]}],
        "schedule": [{"what": "delivery", "when": "tomorrow 10:00", "where": "Gandhi Nagar", "evidence": [2]}],
        "action_items": [{"task": "Deliver order", "owner": "Ramesh", "due": "tomorrow 10:00", "evidence": [2]}],
        "uncertain_spans": []}
    n.update(kw)
    return n


def test_faithfulness_clean_hinglish_note_passes() -> None:
    """Digits in the note are verified against Hinglish number words in the transcript."""
    r = faithfulness.check(_note(), SEGS, ["Asha", "Ravi"])
    assert r["flags"] == [] and r["checked_count"] >= 10


def test_faithfulness_seeded_hallucinations_flagged() -> None:
    bad = _note(items=[{"name": "atta", "quantity": 2, "unit_price": 50, "evidence": [1]},
                       {"name": "ghee", "quantity": 1, "total_price": 9999, "shop": "Suresh Stores", "evidence": [7]}],
                locations=[{"name": "Andheri West", "kind": "delivery", "evidence": [2]}])
    r = faithfulness.check(bad, SEGS, [])
    vals = {(f["value"] if isinstance(f["value"], str) else tuple(f["value"]), f["reason"]) for f in r["flags"]}
    assert ("9999", "not_found_in_transcript") in vals
    assert ("Suresh Stores", "not_found_in_transcript") in vals
    assert ("Andheri West", "not_found_in_transcript") in vals
    assert ((7,), "bad_evidence") in vals


def test_costs_computed_by_code_and_mismatch_flagged() -> None:
    costs = compute_costs(_note())
    assert costs["grand_total"] == 240 and costs["unpriced_items"] == 0
    wrong = _note(stated_totals=[{"amount": 250, "evidence": [2]}])
    reasons = [f["reason"] for f in faithfulness.check(wrong, SEGS + [{"seq": 3, "text": "do sau pachas"}], [])["flags"]]
    assert "total_mismatch" in reasons


def test_costs_group_by_shop_and_count_unpriced() -> None:
    c = compute_costs({"items": [{"name": "a", "quantity": 2, "unit_price": 10, "shop": "X"},
                                 {"name": "b", "total_price": 5, "shop": "Y"}, {"name": "c", "shop": "Y"}]})
    assert {(s["shop"], s["subtotal"], s["unpriced"]) for s in c["by_shop"]} == {("X", 20, 0), ("Y", 5, 1)}
    assert c["grand_total"] == 25 and c["unpriced_items"] == 1


def test_number_words_hinglish_marathi_devanagari() -> None:
    from app.numbers import ascii_digits, word_numbers
    assert ascii_digits("₹५,०००") == "₹5,000"
    assert "280" in word_numbers("total do sau assi rupaye")
    assert "250" in word_numbers("dhai sau gram")
    assert "3.5" in word_numbers("saade teen baje")
    assert "200000" in word_numbers("do lakh")
    assert {"10", "50"} <= word_numbers("दहा किलो, पन्नास रुपये") and "1" not in word_numbers("एकूण")
    assert {"10", "50"} <= word_numbers("das kilo, pachas rupaye")


def test_spoken_form_for_hindi_and_english_itn_elsewhere() -> None:
    """Measured: Gnani ITN broke "dhai sau" on hi-IN; Saar parses numbers itself for hi/en."""
    st = get_settings()
    assert build_headers(st, "hi-IN", [])["x-format"] == "verbatim"
    assert build_headers(st, "en-IN", [])["x-format"] == "verbatim"
    assert build_headers(st, "mr-IN", [])["x-format"] == "transcribe"
    assert "x-bias-list" not in build_headers(st, "hi-IN", [])


# ---------------- summarizer retry ----------------


async def _room_with_segments() -> Room:
    from app.models import Participant
    with session() as s:
        room = Room(code="NOTE01")
        s.add(room)
        s.add(Participant(room_id=room.id, display_name="Asha", role="host", lang_code="en-IN"))
        for i, t in enumerate(["hello", "two kilo atta", "ok done"], 1):
            s.add(Segment(room_id=room.id, participant_id="x", upstream_segment_id=str(i), local_index=i, seq=i,
                          text=t, started_at=i, ended_at=i + 1, audio_ms=1, latency_ms=1))
        s.commit()
    return room


VALID = {"title": "T", "note_language": "en", "conversation_type": "order", "summary": ["s"],
         "items": [{"name": "atta", "quantity": 2, "unit": "kg", "evidence": [2]}]}


async def _wait_note() -> dict[str, object]:
    from app.models import Note
    for _ in range(50):
        await asyncio.sleep(0.05)
        with session() as s:
            n = s.exec(__import__("sqlmodel").select(Note)).first()
        if n and n.status != "pending":
            return {"status": n.status, "error": n.error, "fj": n.faithfulness_json}
    raise AssertionError("note never finished")


async def test_summarizer_retries_then_succeeds() -> None:
    room = await _room_with_segments()
    mock = MockProvider([{"title": "missing fields"}, VALID])
    service.set_provider(mock)
    service.start_note(room, "quick")
    r = await _wait_note()
    assert r["status"] == "ready" and len(mock.calls) == 2 and "failed validation" in mock.calls[1]


async def test_summarizer_fails_gracefully() -> None:
    room = await _room_with_segments()
    service.set_provider(MockProvider([{"bad": 1}, {"bad": 2}]))
    service.start_note(room, "quick")
    r = await _wait_note()
    assert r["status"] == "failed" and "format" in str(r["error"])


# ---------------- retention ----------------


def test_retention_purges_old_keeps_fresh() -> None:
    with session() as s:
        s.add(Room(code="OLD001", created_at=now() - timedelta(hours=30)))
        s.add(Room(code="NEW001"))
        s.commit()
    assert purge() == 1
    with session() as s:
        codes = [r.code for r in s.exec(__import__("sqlmodel").select(Room)).all()]
    assert codes == ["NEW001"]


# ---------------- consent state machine (REST) ----------------


def _client() -> TestClient:
    from app.main import app
    return TestClient(app)


def test_consent_state_machine() -> None:
    c = _client()
    host = c.post("/api/rooms", json={"display_name": "Asha", "lang_code": "hi-IN"}).json()
    code, H = host["room_code"], {"Authorization": f"Bearer {host['token']}"}
    assert c.post(f"/api/rooms/{code}/start", headers=H).status_code == 409  # alone
    guest = c.post(f"/api/rooms/{code}/join", json={"display_name": "Ravi", "lang_code": "mr-IN"}).json()
    G = {"Authorization": f"Bearer {guest['token']}"}
    third = c.post(f"/api/rooms/{code}/join", json={"display_name": "X"})
    assert third.status_code == 409 and third.json()["error"]["code"] == "room_full"
    stale = c.post(f"/api/rooms/{code}/consent", headers=H, json={"action": "grant", "notice_version": "old"})
    assert stale.json()["error"]["code"] == "stale_notice"
    c.post(f"/api/rooms/{code}/consent", headers=H, json={"action": "grant", "notice_version": NOTICE_VERSION})
    r = c.post(f"/api/rooms/{code}/start", headers=H)
    assert r.json()["error"]["code"] == "not_all_consented"
    c.post(f"/api/rooms/{code}/consent", headers=G, json={"action": "grant", "notice_version": NOTICE_VERSION})
    assert c.post(f"/api/rooms/{code}/start", headers=G).status_code == 403  # host only
    assert c.post(f"/api/rooms/{code}/start", headers=H).json() == {"status": "active"}
    c.post(f"/api/rooms/{code}/consent", headers=G, json={"action": "revoke", "notice_version": NOTICE_VERSION})
    st = c.get(f"/api/rooms/{code}", headers=H).json()
    assert st["status"] == "lobby" and not st["all_consented"]
    assert c.post(f"/api/rooms/{code}/start", headers=H).status_code == 409
    assert c.get(f"/api/rooms/{code}", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert c.post("/api/rooms/ZZZZZZ/join", json={"display_name": "Y"}).status_code == 404


def test_solo_room_starts_alone_and_rejects_join() -> None:
    c = _client()
    host = c.post("/api/rooms", json={"display_name": "Me", "solo": True}).json()
    code, H = host["room_code"], {"Authorization": f"Bearer {host['token']}"}
    assert host["call"] is None
    assert c.post(f"/api/rooms/{code}/join", json={"display_name": "X"}).status_code == 409
    c.post(f"/api/rooms/{code}/consent", headers=H, json={"action": "grant", "notice_version": NOTICE_VERSION})
    assert c.post(f"/api/rooms/{code}/start", headers=H).status_code == 200


def test_invalid_bias_rejected_by_api() -> None:
    r = _client().post("/api/rooms", json={"display_name": "A", "bias_words": ["bad word"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


# ---------------- logging ----------------


def test_redaction() -> None:
    assert "secret" not in redact("x-api-key-id: secret123")
    assert "[jwt]" in redact("token eyJhbGciOi.eyJzdWIiOi.abc-def")
    assert "abc" not in redact("GET /ws/stt?token=abc HTTP/1.1")
    rec = logging.LogRecord("t", logging.INFO, "", 0, "connect", None, None)
    rec.data = {"headers": {"x-api-key-id": "k3y"}}
    assert "k3y" not in JsonFormatter().format(rec)


# ---------------- LLM spend cap ----------------


async def test_llm_budget_refuses_before_any_request(tmp_path: "__import__('pathlib').Path") -> None:
    from app.summarizer.providers import BudgetExceeded, OpenAICompatProvider, SpendLedger

    ledger = SpendLedger(str(tmp_path / "spend.json"), 0.20, 0.60, 2.20)
    ledger.record(100_000, 50_000)  # 0.06 + 0.11 = $0.17
    assert abs(ledger.spent() - 0.17) < 1e-9
    # worst case of one more call (1,500 output tokens = $0.0033 + input) would exceed $0.20 only near the cap
    ledger.record(0, 13_000)  # +$0.0286 -> $0.1986
    p = OpenAICompatProvider("http://127.0.0.1:9", "k", "m", ledger)  # port 9: any request would fail loudly
    with pytest.raises(BudgetExceeded):
        await p.generate_note("s" * 2000, "u", max_tokens=1500, timeout_s=1)
    assert abs(ledger.spent() - 0.1986) < 1e-9  # refused call cost nothing
