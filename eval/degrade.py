"""Deterministic telephony/noise degradations (spec §15.2). All approximations — labelled as such in the report."""
from collections.abc import Callable

import numpy as np
from scipy import signal

SR = 16000
Cond = Callable[[np.ndarray, np.random.Generator, list[np.ndarray]], tuple[np.ndarray, int]]


def telephone(x: np.ndarray) -> tuple[np.ndarray, int]:
    """300–3,400 Hz band-pass → 8 kHz → G.711 µ-law encode/decode."""
    sos = signal.butter(4, [300, 3400], btype="band", fs=SR, output="sos")
    y = signal.resample_poly(signal.sosfilt(sos, x), 1, 2)
    mu = 255.0
    q = np.round((np.sign(y) * np.log1p(mu * np.abs(np.clip(y, -1, 1))) / np.log1p(mu) + 1) * 127.5)  # 8-bit
    y = q / 127.5 - 1
    return np.sign(y) * np.expm1(np.abs(y) * np.log1p(mu)) / mu, 8000


def white(n: int, rng: np.random.Generator) -> np.ndarray:
    return rng.standard_normal(n)


def pink(n: int, rng: np.random.Generator) -> np.ndarray:
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.arange(len(spec))
    spec[1:] /= np.sqrt(f[1:])
    return np.fft.irfft(spec, n)


def babble(n: int, rng: np.random.Generator, pool: list[np.ndarray]) -> np.ndarray:
    """Sum of 5 other synthetic voices, looped to length."""
    out = np.zeros(n)
    for k in rng.choice(len(pool), size=min(5, len(pool)), replace=False):
        v = np.resize(pool[k], n)
        out += np.roll(v, rng.integers(0, n))
    return out


def street(n: int, rng: np.random.Generator) -> np.ndarray:
    """Low-passed rumble plus random horn-like bursts (synthetic stand-in for traffic)."""
    rumble = signal.sosfilt(signal.butter(2, 300, fs=SR, output="sos"), rng.standard_normal(n)) * 4
    t = np.arange(n) / SR
    bursts = np.zeros(n)
    for _ in range(max(1, n // SR // 3)):
        s, d = rng.integers(0, max(1, n - SR // 2)), rng.integers(SR // 10, SR // 2)
        f = rng.uniform(300, 700)
        bursts[s:s + d] += np.sin(2 * np.pi * f * t[:d]) * np.hanning(d)[: len(bursts[s:s + d])]
    return rumble + bursts * 0.5


def mix(x: np.ndarray, noise: np.ndarray, snr_db: float) -> np.ndarray:
    px, pn = np.mean(x**2) + 1e-12, np.mean(noise**2) + 1e-12
    y = x + noise * np.sqrt(px / (pn * 10 ** (snr_db / 10)))
    return y / max(1.0, np.max(np.abs(y)) / 0.99)


def packet_loss(x: np.ndarray, rate: float, rng: np.random.Generator) -> np.ndarray:
    y = x.copy()
    target, lost = rate * len(x), 0
    while lost < target:
        d = int(rng.uniform(0.02, 0.06) * SR)
        s = rng.integers(0, max(1, len(x) - d))
        y[s:s + d] = 0
        lost += d
    return y


def spectral_gate(x: np.ndarray) -> np.ndarray:
    """Crude stand-in for browser noise suppression: gate STFT bins below 1.5x the quietest-frames floor."""
    f, t, Z = signal.stft(x, SR, nperseg=512)
    mag = np.abs(Z)
    floor = np.percentile(mag, 10, axis=1, keepdims=True)
    Z = Z * np.clip((mag - 1.5 * floor) / (mag + 1e-9), 0, 1)
    return signal.istft(Z, SR, nperseg=512)[1][: len(x)]


def _noise(kind: str, n: int, rng: np.random.Generator, pool: list[np.ndarray]) -> np.ndarray:
    return {"white": lambda: white(n, rng), "pink": lambda: pink(n, rng), "street": lambda: street(n, rng),
            "babble": lambda: babble(n, rng, pool)}[kind]()


def noisy(kind: str, snr: float) -> Cond:
    return lambda x, rng, pool: (mix(x, _noise(kind, len(x), rng, pool), snr), SR)


CONDITIONS: dict[str, Cond] = {
    "clean": lambda x, rng, pool: (x, SR),
    "telephone": lambda x, rng, pool: telephone(x),
    **{f"{k}_{s}dB": noisy(k, s) for k in ("babble", "white") for s in (20, 10, 5, 0)},
    "pink_10dB": noisy("pink", 10),
    "street_10dB": noisy("street", 10),
    **{f"loss_{int(r * 100)}pct": (lambda r: lambda x, rng, pool: (packet_loss(x, r, rng), SR))(r)
       for r in (0.05, 0.10, 0.20)},
    "telephone+babble_10dB": lambda x, rng, pool: telephone(mix(x, babble(len(x), rng, pool), 10)),
    "telephone+loss_10pct": lambda x, rng, pool: telephone(packet_loss(x, 0.10, rng)),
    "babble_5dB+ns_approx": lambda x, rng, pool: (spectral_gate(mix(x, babble(len(x), rng, pool), 5)), SR),
}
