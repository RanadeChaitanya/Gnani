"""Build the demo soundtrack: an original ambient bed, soft UI sounds on taps and scene changes, and the narration on top."""

import json, pathlib, wave
import numpy as np

D = pathlib.Path(__file__).parent
TL = json.load(open(D / "timeline.json"))
EV = json.load(open(D / "call_events.json"))
SR = 44100
DUR = TL[-1]["s"] + TL[-1]["d"]
N = int(DUR * SR)
rng = np.random.default_rng(9)
T = lambda d: np.arange(int(d * SR)) / SR
midi = lambda m: 440 * 2 ** ((m - 69) / 12)
bed, sfx, vo = np.zeros(N), np.zeros(N), np.zeros(N)


def put(buf, t, x, g=1.0):
    a = int(t * SR)
    if 0 <= a < N:
        b = min(N, a + len(x))
        buf[a:b] += x[: b - a] * g


def keys(f, d=2.4):
    x = T(d)
    return np.sin(
        2 * np.pi * f * x + 0.8 * np.exp(-4 * x) * np.sin(4 * np.pi * f * x)
    ) * np.exp(-1.6 * x)


def pad(fs, d):
    x = T(d)
    s = sum(
        np.sin(2 * np.pi * f * x) + 0.3 * np.sin(4 * np.pi * f * x + 0.4) for f in fs
    ) / len(fs)
    return s * np.minimum(1, x / 1.5) * np.minimum(1, (d - x) / 1.5)


def tick(f=1800, d=0.05):
    return np.sin(2 * np.pi * f * T(d)) * np.exp(-70 * T(d))


def whoosh(d=0.6):
    n = np.convolve(rng.normal(0, 1, int(d * SR)), np.ones(30) / 30, "same")
    return n * np.sin(np.pi * T(d) / d) ** 2


# a slow, warm progression; light pulse enters after the intro
PROG = [[57, 60, 64, 71], [53, 57, 60, 67], [48, 55, 60, 64], [55, 59, 62, 69]]
BAR = 60 / 84 * 4
t, b = 0.0, 0
while t < DUR:
    ch = PROG[b % 4]
    put(bed, t, pad([midi(m) for m in ch], BAR + 1.5), 0.16)
    put(
        bed,
        t,
        np.sin(2 * np.pi * midi(ch[0] - 12) * T(BAR)) * np.exp(-0.6 * T(BAR)),
        0.2,
    )
    for k, m in enumerate([ch[1], ch[2], ch[3], ch[2]]):
        put(bed, t + k * BAR / 4, keys(midi(m + 12), 1.6), 0.07 if t > 8 else 0.03)
    if 8 < t < DUR - 6:
        for k in range(8):
            put(
                bed,
                t + k * BAR / 8,
                np.diff(rng.normal(0, 1, 2206)) * np.exp(-80 * T(0.05)),
                0.025,
            )
    t += BAR
    b += 1
bed[int((DUR - 4) * SR) :] *= np.linspace(1, 0, N - int((DUR - 4) * SR))

# scene changes and taps (taps follow the real recording, mapped into each scene)
for s in TL[1:]:
    put(sfx, s["s"] - 0.15, whoosh(0.5), 0.05)
sc = {s["k"]: s for s in TL}
MAP = {"dial": (0.8, 11.0), "live": (11.0, 46.0), "note": (46.4, 60.4)}
for ev in ("dial", "ring", "accept", "end", "confirm_j", "confirm_g"):
    v = EV[ev]
    for k, (a, b2) in MAP.items():
        if a <= v <= b2:
            put(
                sfx,
                sc[k]["s"] + (v - a) / (b2 - a) * sc[k]["d"],
                tick(1500 if ev != "ring" else 900, 0.08),
                0.25,
            )
r = sc["dial"]["s"] + (EV["ring"] - 0.8) / (11.0 - 0.8) * sc["dial"]["d"]
for k in range(3):
    put(
        sfx, r + k * 0.5, np.sin(2 * np.pi * 880 * T(0.25)) * np.exp(-8 * T(0.25)), 0.08
    )

for s in TL:
    with wave.open(str(D / f"vo/{s['k']}.wav")) as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16) / 32768
    put(vo, s["vo"], pcm)
vo = vo / np.abs(vo).max() * 0.9


def smooth(
    x, k
):  # moving average via cumulative sum (np.convolve is far too slow at this length)
    c = np.cumsum(np.concatenate([np.zeros(k // 2 + 1), x, np.zeros(k)]))
    return (c[k : k + len(x)] - c[: len(x)]) / k


act = smooth((np.abs(vo) > 0.02).astype(float), int(0.3 * SR)) > 0.05
duck = smooth(act.astype(float), int(0.25 * SR))
mix = np.tanh((vo + bed * (1 - duck * 0.55) * 0.6 + sfx) * 0.95)
with wave.open(str(D / "mix.wav"), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("ok", round(DUR, 1))
