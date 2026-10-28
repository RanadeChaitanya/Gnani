"""Evaluation runner (spec §15): E1 noise sweep (REST), E2 VAD presets (WebSocket, real-time), E4 note propagation.

  python eval/make_audio.py                 # once: synthesize dialogue audio with Gnani TTS
  python eval/run_eval.py --plan            # audio seconds per experiment, no API calls
  python eval/run_eval.py --yes             # run (refuses if over EVAL_MAX_AUDIO_SECONDS without --yes)
  python eval/report.py                     # charts + results/report.md

Results are cached per (clip, config) in eval/cache, so re-runs never re-spend credits.
E3 (word boosting / format) and E5 (REST vs WS) are on the spec's cut list and not run.
"""
import argparse
import asyncio
import csv
import hashlib
import json
import os
import time
import zlib
from typing import Any

import httpx
import numpy as np
import websockets

from common import CACHE, RESULTS, SR, S, cer, clip_path, dialogues, fact_found, pcm16, read_wav, wav_bytes, wer
from degrade import CONDITIONS

from app.gnani.stt_client import FRAME_BYTES, build_headers  # noqa: E402
from app.summarizer import faithfulness, prompts  # noqa: E402
from app.summarizer.providers import make_provider  # noqa: E402
from app.summarizer.schema import NoteContent, json_schema  # noqa: E402

E1_DEFAULT = ["clean", "telephone", "babble_20dB", "babble_10dB", "babble_5dB", "babble_0dB", "white_10dB",
              "loss_10pct", "telephone+babble_10dB", "babble_5dB+ns_approx"]
E2_PRESETS = [(0.5, 500), (0.5, 700), (0.5, 900), (0.7, 500), (0.7, 700), (0.7, 900)]
E4_CONDS = ["clean", "babble_10dB", "babble_0dB", "telephone+babble_10dB"]
WS_TAIL_S = 1.5


def cached(kind: str, audio: bytes, cfg: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    key = hashlib.sha1(audio + json.dumps({"k": kind, **cfg}, sort_keys=True).encode()).hexdigest()
    p = CACHE / f"{key}.json"
    return key, json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def store(key: str, val: dict[str, Any]) -> dict[str, Any]:
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / f"{key}.json").write_text(json.dumps(val, ensure_ascii=False), encoding="utf-8")
    return val


class Usage:
    seconds = 0.0  # audio actually sent (cache misses only)


async def rest_stt(c: httpx.AsyncClient, sem: asyncio.Semaphore, x: np.ndarray, sr: int, lang: str,
                   fmt: str) -> str:
    audio = wav_bytes(x, sr)
    key, hit = cached("rest", audio, {"lang": lang, "fmt": fmt})
    if hit:
        return str(hit["text"])
    async with sem:
        for attempt in range(3):
            r = await c.post(f"{S.gnani_base_url}/stt/v3", headers={"X-API-Key-ID": S.gnani_api_key},
                             files={"audio_file": ("clip.wav", audio, "audio/wav")},
                             data={"language_code": lang, "format": fmt})
            if r.status_code not in (429, 500, 503):
                break
            await asyncio.sleep(2 ** attempt)
    r.raise_for_status()
    Usage.seconds += len(x) / sr
    return str(store(key, {"text": r.json().get("transcript", "")})["text"])


async def ws_stt(sem: asyncio.Semaphore, x: np.ndarray, lang: str, thr: float, sil: int) -> dict[str, Any]:
    pcm = pcm16(np.concatenate([x, np.zeros(int(WS_TAIL_S * SR))]))
    key, hit = cached("ws", pcm, {"lang": lang, "thr": thr, "sil": sil})
    if hit:
        return hit
    s = S.model_copy(update={"stt_vad_threshold": thr, "stt_min_silence_ms": sil, "stt_format_default": "verbatim"})
    msgs: list[dict[str, Any]] = []
    async with sem, websockets.connect(S.stt_url, additional_headers=build_headers(s, lang, [])) as ws:
        await ws.recv()

        async def reader() -> None:
            async for m in ws:
                msgs.append(json.loads(m) | {"_t": time.perf_counter()})

        rt = asyncio.ensure_future(reader())
        t0 = time.perf_counter()
        for i in range(len(pcm) // FRAME_BYTES):
            await asyncio.sleep(max(0, t0 + i * 0.032 - time.perf_counter()))
            await ws.send(pcm[i * FRAME_BYTES:(i + 1) * FRAME_BYTES])
        await asyncio.sleep(1.5)
        rt.cancel()
    Usage.seconds += len(pcm) / 2 / SR
    tr = [m for m in msgs if m.get("type") == "transcript"]
    return store(key, {"text": " ".join(m["text"] for m in tr), "segments": len(tr),
                       "latency_ms": float(np.mean([m["latency"] for m in tr])) if tr else None})


def degrade(name: str, x: np.ndarray, seed: int, pool: list[np.ndarray]) -> tuple[np.ndarray, int]:
    return CONDITIONS[name](x, np.random.default_rng(seed), pool)


def est_seconds(text: str) -> float:
    return 0.45 * len(text.split()) + 0.4


def plan(ds: list[dict[str, Any]], e1: list[str], e2_n: int) -> dict[str, float]:
    def dur(d: dict[str, Any], i: int, t: dict[str, Any]) -> float:
        p = clip_path(d, i)
        return len(read_wav(p)) / SR if p.exists() else est_seconds(t["text"])
    per = {d["id"]: [dur(d, i, t) for i, t in enumerate(d["turns"])] for d in ds}
    total = sum(sum(v) for v in per.values())
    e2 = sum(sum(x + WS_TAIL_S for x in per[d["id"]]) for d in ds[:e2_n]) * len(E2_PRESETS)
    return {"E1": total * len(e1), "E2": e2, "E4": total * len(E4_CONDS)}


async def run(ds: list[dict[str, Any]], e1: list[str], e2_n: int, conc: int) -> list[dict[str, Any]]:
    sem = asyncio.Semaphore(conc)
    clips = {(d["id"], i): read_wav(clip_path(d, i)) for d in ds for i in range(len(d["turns"]))}
    rows: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=90) as c:
        async def e1_one(d: dict[str, Any], i: int, cond: str) -> None:
            t = d["turns"][i]
            lang = d["speakers"][t["speaker"]]["lang"]
            pool = [v for k, v in clips.items() if k[0] != d["id"]]
            y, sr = degrade(cond, clips[(d["id"], i)], zlib.crc32(f"{d['id']}|{i}|{cond}".encode()), pool)
            hyp = await rest_stt(c, sem, y, sr, lang, "verbatim")
            rows.append({"exp": "E1", "dialogue": d["id"], "domain": d["domain"], "lang": lang, "turn": i,
                         "condition": cond, "ref": t["text"], "hyp": hyp, "wer": wer(t["text"], hyp),
                         "cer": cer(t["text"], hyp)})

        await asyncio.gather(*(e1_one(d, i, cond) for d in ds for i in range(len(d["turns"])) for cond in e1))
        print(f"E1 done ({len(rows)} rows)")

        async def e2_one(d: dict[str, Any], i: int, thr: float, sil: int) -> None:
            t = d["turns"][i]
            lang = d["speakers"][t["speaker"]]["lang"]
            r = await ws_stt(sem, clips[(d["id"], i)], lang, thr, sil)
            rows.append({"exp": "E2", "dialogue": d["id"], "lang": lang, "turn": i, "preset": f"thr{thr}_sil{sil}",
                         "vad_threshold": thr, "min_silence_ms": sil, "ref": t["text"], "hyp": r["text"],
                         "wer": wer(t["text"], r["text"]), "segments": r["segments"], "latency_ms": r["latency_ms"]})

        await asyncio.gather(*(e2_one(d, i, thr, sil) for d in ds[:e2_n] for i in range(len(d["turns"]))
                               for thr, sil in E2_PRESETS))
        print("E2 done")

        llm = make_provider(S)

        async def e4_one(d: dict[str, Any], cond: str) -> None:
            segs, refs = [], []
            pool = [v for k, v in clips.items() if k[0] != d["id"]]
            for i, t in enumerate(d["turns"]):
                lang = d["speakers"][t["speaker"]]["lang"]
                y, sr = degrade(cond, clips[(d["id"], i)], zlib.crc32(f"{d['id']}|{i}|{cond}".encode()), pool)
                hyp = await rest_stt(c, sem, y, sr, lang, "transcribe")
                segs.append({"seq": i + 1, "name": t["speaker"], "text": hyp, "started_at": float(i)})
                refs.append({"seq": i + 1, "name": t["speaker"], "text": t["text"], "started_at": float(i)})
            parts = [{"name": k, "lang_code": v["lang"]} for k, v in d["speakers"].items()]
            user = prompts.user_prompt("en", parts, prompts.transcript_lines(segs, 60000))
            key, hit = cached("note", user.encode(), {"model": llm.model, "v": prompts.PROMPT_VERSION})
            note = hit or store(key, (await llm.generate_note(prompts.system_prompt(json_schema()), user,
                                                              max_tokens=1500, timeout_s=90))[0])
            NoteContent.model_validate(note)
            flagged = {(f["field"], str(f["value"])) for f in faithfulness.check(note, segs, ["A", "B"])["flags"]
                       if f["reason"] == "not_found_in_transcript"}
            gold = refs + [{"seq": 0, "text": " ".join(d["gold_facts"])}]
            chk = faithfulness.check(note, gold, ["A", "B"])
            actual = {(f["field"], str(f["value"])) for f in chk["flags"] if f["reason"] == "not_found_in_transcript"}
            text = json.dumps(note, ensure_ascii=False)
            rows.append({"exp": "E4", "dialogue": d["id"], "condition": cond,
                         "wer": float(np.mean([wer(r["text"], s["text"]) for r, s in zip(refs, segs)])),
                         "fact_recall": float(np.mean([fact_found(f, text) for f in d["gold_facts"]])),
                         "hallucination_rate": len(actual) / max(1, chk["checked_count"]),
                         "flags": len(flagged), "actual_errors": len(actual), "true_flags": len(flagged & actual)})

        await asyncio.gather(*(e4_one(d, cond) for d in ds for cond in E4_CONDS))
        print("E4 done")
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--e1", default=",".join(E1_DEFAULT), help="comma-separated conditions (see degrade.py)")
    ap.add_argument("--e2-dialogues", type=int, default=2)
    ap.add_argument("--dialogues", type=int, default=0, help="use only the first N dialogues (0 = all)")
    ap.add_argument("--concurrency", type=int, default=2)
    a = ap.parse_args()
    ds = dialogues()[: a.dialogues or None]
    e1 = a.e1.split(",")
    p = plan(ds, e1, a.e2_dialogues)
    budget = float(os.environ.get("EVAL_MAX_AUDIO_SECONDS", 1200))
    for k, v in p.items():
        print(f"{k}: {v / 60:6.1f} min audio")
    print(f"total: {sum(p.values()) / 60:.1f} min (budget {budget / 60:.0f} min; cached clips cost nothing)")
    if a.plan:
        return
    if sum(p.values()) > budget and not a.yes:
        raise SystemExit("Over EVAL_MAX_AUDIO_SECONDS — reduce --dialogues/--e1, or pass --yes.")
    missing = [d["id"] for d in ds for i in range(len(d["turns"])) if not clip_path(d, i).exists()]
    if missing:
        raise SystemExit(f"Audio missing for {sorted(set(missing))} — run eval/make_audio.py first.")
    rows = asyncio.run(run(ds, e1, a.e2_dialogues, a.concurrency))
    RESULTS.mkdir(parents=True, exist_ok=True)
    keys = sorted({k for r in rows for k in r}, key=lambda k: (k not in ("exp", "dialogue", "condition"), k))
    with open(RESULTS / "results.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, keys)
        w.writeheader()
        w.writerows(rows)
    (RESULTS / "usage.json").write_text(json.dumps({"stt_audio_seconds_sent_this_run": round(Usage.seconds, 1),
                                                    "date": time.strftime("%Y-%m-%d")}), encoding="utf-8")
    print(f"wrote {len(rows)} rows; audio sent this run {Usage.seconds / 60:.1f} min")


if __name__ == "__main__":
    main()
