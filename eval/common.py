"""Shared eval helpers: paths, dialogue loading, WAV IO, Gnani REST calls, text metrics."""
import io
import re
import sys
import unicodedata
import wave
from pathlib import Path
from typing import Any

import jiwer
import numpy as np
import yaml
from rapidfuzz import fuzz

EVAL = Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL.parent / "backend"))
from app.config import get_settings  # noqa: E402

S = get_settings()
AUDIO = EVAL / "audio"      # synthetic audio only (gitignored)
CACHE = EVAL / "cache"
RESULTS = EVAL / "results"
SR = 16000


def dialogues() -> list[dict[str, Any]]:
    return [yaml.safe_load(p.read_text(encoding="utf-8")) for p in sorted((EVAL / "dialogues").glob("*.yaml"))]


def clip_path(d: dict[str, Any], i: int) -> Path:
    return AUDIO / d["id"] / f"{i:02d}.wav"


def read_wav(p: Path) -> np.ndarray:
    with wave.open(str(p)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1
        return np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768


def wav_bytes(x: np.ndarray, sr: int) -> bytes:
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return b.getvalue()


def pcm16(x: np.ndarray) -> bytes:
    return (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()


# ---------------- metrics ----------------

def normalize(t: str) -> str:
    t = unicodedata.normalize("NFKC", t).casefold()
    t = "".join(str(unicodedata.digit(c)) if unicodedata.category(c) == "Nd" else c for c in t)
    t = re.sub(r"(?<=\d),(?=\d)", "", t)
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def wer(ref: str, hyp: str) -> float:
    r, h = normalize(ref), normalize(hyp)
    return float(jiwer.wer(r, h)) if r else 0.0


def cer(ref: str, hyp: str) -> float:
    r, h = normalize(ref), normalize(hyp)
    return float(jiwer.cer(r, h)) if r else 0.0


def fact_found(fact: str, text: str) -> bool:
    """Gold fact present in a note/transcript: digits must match exactly, words fuzzily."""
    f, t = normalize(fact), normalize(text)
    if f.replace(" ", "").isdigit():
        return f.replace(" ", "") in re.sub(r"\s", "", t) or f in t.split()
    return fuzz.partial_ratio(f, t) >= 85


def ci95(xs: list[float], n: int = 1000, seed: int = 0) -> tuple[float, float]:
    """Bootstrap 95 % CI of the mean."""
    if len(xs) < 3:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    a = np.array(xs)
    means = a[rng.integers(0, len(a), (n, len(a)))].mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))
