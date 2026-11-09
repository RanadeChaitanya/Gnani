"""Mix the promo soundtrack: ambience and sound effects synthesised in code, the score, and the narration."""

import json, pathlib, wave
import numpy as np

SR, N = 44100, 60 * 44100
ROOT = pathlib.Path(__file__).parent
rng = np.random.default_rng(11)
music = np.load(ROOT / "jingle.npy")
D = json.load(open(ROOT / "cues.json"))
NC = D["cues"]
C = NC
c = [x[0] for x in C]
z5 = max(2, C[5][1] - c[5] - 1)
track = np.zeros(N)


def put(t, x, g=1.0):
    a = int(t * SR)
    if a < 0 or a >= N:
        return
    b = min(N, a + len(x))
    track[a:b] += x[: b - a] * g


T = lambda d: np.arange(int(d * SR)) / SR
sine = lambda f, d, dk=8: np.sin(2 * np.pi * f * T(d)) * np.exp(-dk * T(d))


def sweep(f0, f1, d, dk=0, vib=0, vr=14):
    x = T(d)
    f = np.geomspace(f0, f1, len(x)) * (1 + vib * np.sin(2 * np.pi * vr * x))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-dk * x)


def lp(x, k):
    return np.convolve(x, np.ones(k) / k, "same")


def noise(d, k=1, dk=0):
    return lp(rng.normal(0, 1, int(d * SR)), k) * k**0.5 * np.exp(-dk * T(d))


def bandn(d, k1, k2, dk=0):  # band-limited noise
    n = rng.normal(0, 1, int(d * SR))
    return (lp(n, k1) - lp(n, k2)) * k1**0.5 * np.exp(-dk * T(d))


def bell(fs, d=0.9, dk=7):
    out = sum(sine(f, d, dk * (1 + i * 0.5)) / (1 + i) for i, f in enumerate(fs))
    return out / 1.8


def wood(f=700):
    return sine(f, 0.08, 55) + 0.5 * sine(f * 2.3, 0.08, 90)


def boing(f=180):
    return sweep(f, f * 2.6, 0.32, 7, 0.22, 27)


def pop(f=500):
    x = T(0.09)
    return np.sin(2 * np.pi * (f * x + 3200 * x * x)) * np.exp(-42 * x)


def thud(f=52, d=0.7):
    return sweep(f * 2.2, f, d, 6) + 0.6 * noise(d, 90, 12)


def whoosh(d=0.42):
    x = T(d)
    return bandn(d, 8, 60) * np.sin(np.pi * x / d) ** 2 * 0.9


def ring():  # old mechanical telephone bell
    x = T(0.8)
    tone = (
        np.sin(2 * np.pi * 1180 * x)
        + 0.7 * np.sin(2 * np.pi * 1510 * x)
        + 0.4 * np.sin(2 * np.pi * 2730 * x)
    )
    return (
        tone
        * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 21 * x)))
        * np.minimum(1, (0.8 - x) * 12)
        * 0.55
    )


def scribble(d):
    x = T(d)
    return bandn(d, 3, 14) * (0.35 + 0.65 * np.abs(np.sin(2 * np.pi * 6.5 * x)) ** 2)


def trombone(fs, each=0.42):
    out = []
    for i, f in enumerate(fs):
        x = T(each * (1.9 if i == len(fs) - 1 else 1))
        fr = (
            f
            * (1 + 0.02 * np.sin(2 * np.pi * 6 * x))
            * (1 - (0.14 * x / x[-1] if i == len(fs) - 1 else 0))
        )
        ph = np.cumsum(fr) / SR
        saw = 2 * (ph % 1) - 1
        out.append(
            lp(saw, 12) * np.minimum(1, x * 40) * np.minimum(1, (x[-1] - x) * 16)
        )
    return np.concatenate(out)


def crackers(t, n=5):
    for i in range(n):
        put(t + i * 0.13 + rng.random() * 0.06, noise(0.07, 3, 60), 0.22)


# market ambience: a low murmur that follows the story
murmur = bandn(60, 60, 500)
mod = lp(rng.random(N), 30000) * 3
amb = np.ones(N) * 0.6
amb[int(c[2] * SR) : int(c[5] * SR)] = 1.15
amb[int(c[5] * SR) : int(c[6] * SR)] = 0.5
amb[int(c[8] * SR) : int(c[9] * SR)] = 0.15
amb[int(c[14] * SR) :] = 0
amb = lp(amb, 8000)
track += murmur * amb * np.clip(mod, 0, 2) * 0.05
for t in (2.1, 16.0, 24.0, 47.0):
    put(t, sine(420, 0.35, 3) + sine(530, 0.35, 3), 0.025)  # distant horn

# no scribbling anywhere: paper, wood and soft tones only
put(c[1] + 0.15, whoosh(0.3), 0.08)
for i in range(3):
    put(c[1] + 0.5 + [0, 1.3, 2.6][i], pop(460 + i * 60), 0.1)
put(c[1] + 3.12, wood(420), 0.14)
for i in range(8):
    put(c[2] + 0.55 + i * 0.34, thud(140, 0.18), 0.17)
for i in range(3):
    put(c[2] + 2.3 + i * 1.0, ring(), 0.05)
for i in range(3):
    put(c[3] + i * 1.0, ring(), 0.05)
for i in range(3):
    put(c[4] + 0.3 + i * 0.35, pop(420), 0.09)
put(c[5] + 0.1, whoosh(0.3), 0.08)
put(c[5] + 0.8, whoosh(0.3), 0.08)
put(c[5] + 2.4, pop(380), 0.1)
for i in range(7):
    put(c[6] + 0.1 + i * 0.14, noise(0.14, 5, 22), 0.09)
put(c[6] + 1.45, thud(110, 0.3), 0.34)
put(c[7] - 0.3, wood(600), 0.08)
put(c[7] + 0.1, wood(650), 0.08)
put(c[9] - 0.1, whoosh(0.4), 0.1)
put(c[9] + 0.9, bell([1046, 2093], 0.5, 9), 0.12)
put(c[9] + 1.8, bell([1318, 2637], 0.5, 9), 0.12)
for i in range(4):
    put(c[10] + 0.5 + i * 1.35, sine(1500, 0.05, 60), 0.05)
for i in range(2):
    put(c[11] + 1.9 + i * 0.8, thud(120, 0.22), 0.3)
put(c[12] - 0.05, whoosh(0.4), 0.1)
for i in range(6):
    put(c[12] + 0.5 + i * 0.42, sine(1100, 0.05, 50), 0.05)
put(c[13] - 0.2, whoosh(0.7), 0.14)
put(c[14], bell([523, 784], 1.1, 3.5), 0.1)
put(c[15], bell([659, 1046], 1.2, 3), 0.1)
sfx = track

vo = np.zeros(N)
act = np.zeros(N)
for i, (a, b) in enumerate(NC):
    with wave.open(str(ROOT / f"vo2/{i:02d}.wav")) as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16) / 32768
    x = int(a * SR)
    vo[x : x + len(pcm)] += pcm
    act[max(0, x - 3000) : x + len(pcm) + 3000] = 1
vo = vo / np.abs(vo).max() * 0.9
env = lp(act, int(0.1 * SR))
mix = vo * 0.95 + music * (1 - env * 0.55) * 0.42 + sfx * (1 - 0.25 * env) * 0.75
mix = np.tanh(mix * 0.95)
with wave.open(str(ROOT / "mix.wav"), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("ok")
