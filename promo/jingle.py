"""Original score: warm keys, strings, soft tabla and a bansuri-style theme. Calm, urgent, silent at the mistake, hopeful, full at the reveal."""
import json, pathlib
import numpy as np

SR, N = 44100, 60 * 44100
ROOT = pathlib.Path(__file__).parent
D = json.load(open(ROOT / "cues.json"))
c = [x[0] for x in D["cues"]]
USE, END = c[8], c[15]
HIT = c[6] + 1.0
TENSE = c[3]
rng = np.random.default_rng(5)
BEAT = 60 / 92
out = np.zeros(N)
midi = lambda m: 440 * 2 ** ((m - 69) / 12)


def put(t, x, g=1.0):
    a = int(t * SR)
    if 0 <= a < N:
        b = min(N, a + len(x))
        out[a:b] += x[:b - a] * g


T = lambda d: np.arange(int(d * SR)) / SR


def keys(f, d=1.6):  # electric-piano style FM tone
    x = T(d)
    return np.sin(2 * np.pi * f * x + 1.1 * np.exp(-5 * x) * np.sin(2 * np.pi * 2 * f * x)) * np.exp(-2.6 * x)


def bass(f, d=.9):
    x = T(d)
    return (np.sin(2 * np.pi * f * x) + .3 * np.sin(4 * np.pi * f * x)) * np.minimum(1, x * 60) * np.exp(-2.4 * x)


def strings(fs, d, attack=1.0):
    x = T(d)
    s = 0
    for f in fs:
        for det in (.997, 1.003):
            s = s + 2 * ((f * det * x + .002 * np.sin(2 * np.pi * 5 * x)) % 1) - 1
    k = 60
    s = np.convolve(s / (2 * len(fs)), np.ones(k) / k, "same")
    s = np.convolve(s, np.ones(k) / k, "same")
    return s * np.minimum(1, x / attack) * np.minimum(1, (d - x) * 2)


def bansuri(f, d):
    x = T(d)
    vib = 1 + .009 * np.sin(2 * np.pi * 5.2 * x) * np.minimum(1, x * 2.5)
    ph = np.cumsum(f * vib) / SR
    tone = np.sin(2 * np.pi * ph) + .22 * np.sin(4 * np.pi * ph)
    breath = np.convolve(rng.normal(0, 1, len(x)), np.ones(6) / 6, "same") * .05
    return (tone + breath) * np.minimum(1, x * 10) * np.minimum(1, (d - x) * 7)


def tabla_low():
    x = T(.3)
    return np.sin(2 * np.pi * np.cumsum(np.geomspace(130, 72, len(x))) / SR) * np.exp(-10 * x)


def tabla_high():
    x = T(.16)
    return (np.sin(2 * np.pi * 620 * x) + .5 * np.sin(2 * np.pi * 1010 * x)) * np.exp(-24 * x) * .55


def shaker():
    x = T(.05)
    return np.diff(rng.normal(0, 1, len(x) + 1)) * np.exp(-70 * x) * .22


CHORD = {"Am9": [45, 60, 64, 67, 71], "F": [41, 60, 64, 69, 72], "C": [48, 60, 64, 67, 71], "G": [43, 59, 62, 67, 69], "Dm": [50, 60, 62, 65, 69], "E": [40, 59, 62, 64, 68]}
CALM = ["C", "Am9", "F", "G"]
THEME = [(0, 76, 1), (1, 79, 1), (2, 81, 1.5), (3.5, 79, .5), (4, 76, 2), (6, 74, 1), (7, 72, 1)]
THEME2 = [(0, 76, 1), (1, 79, 1), (2, 84, 1.5), (3.5, 83, .5), (4, 81, 1), (5, 79, 1), (6, 76, 2)]


def play_chord(t, name, g, roll=.02):
    ch = CHORD[name]
    put(t, bass(midi(ch[0])), .34 * g)
    for i, m in enumerate(ch[1:]):
        put(t + i * roll, keys(midi(m)), .16 * g)


def groove(t, strength):
    put(t, tabla_low(), .3 * strength)
    put(t + BEAT * 1.5, tabla_low(), .2 * strength)
    put(t + BEAT * 2.5, tabla_low(), .16 * strength)
    for k in (1, 3):
        put(t + BEAT * k, tabla_high(), .26 * strength)
    for k in range(8):
        put(t + k * BEAT / 2, shaker(), .5 * strength)


# ---- calm opening, then a tightening pulse as the order grows ----
b, t = 0, 0.0
while t < HIT:
    rush = np.clip((t - TENSE) / (HIT - TENSE), 0, 1)
    tense = t >= TENSE
    name = ["Am9", "Am9", "F", "E"][b % 4] if tense else CALM[b % 4]
    play_chord(t, name, 1)
    groove(t, .55 + .5 * rush)
    if not tense and b % 2 == 0:
        for off, m, ln in THEME:
            if t + off * BEAT < TENSE:
                put(t + off * BEAT, bansuri(midi(m), ln * BEAT * .96), .11)
    if tense:
        for k in range(8 if rush < .5 else 16):  # ostinato strings
            step = BEAT * 4 / (8 if rush < .5 else 16)
            put(t + k * step, keys(midi(CHORD[name][2] + (k % 2) * 12), .22), .13 + .06 * rush)
        put(t, strings([midi(m + 12) for m in CHORD[name][1:4]], BEAT * 4, .4), .05 + .08 * rush)
    t += BEAT * 4
    b += 1
out[int(HIT * SR):] = 0  # the music stops when the cartons land
put(HIT, bass(midi(28), 2.4), .4)

# ---- the argument: a low, unresolved pulse ----
t = HIT + .4
while t < c[7] - .4:
    put(t, tabla_low(), .3)
    put(t + BEAT, tabla_low(), .18)
    put(t, strings([midi(52), midi(57), midi(60)], BEAT * 3.8, .6), .1)
    t += BEAT * 4

# ---- the daughter's line: almost silent, one held chord ----
put(c[7] - .5, strings([midi(57), midi(60), midi(64)], USE - c[7] + 1.5, 1.0), .09)

# ---- using Saar: no drop, the music simply opens up and stays composed ----
SEQ = ["F", "C", "Dm", "G", "Am9", "F", "C", "G"]
b, t = 0, USE
while t < END - .05:
    name = SEQ[b % 8]
    bars = min(BEAT * 4, END - t)
    fade = min(1, (t - USE) / (BEAT * 8) + .45)
    put(t, strings([midi(m + 12) for m in CHORD[name][1:4]], bars + .4, 1.0), .11 * fade)
    put(t, bass(midi(CHORD[name][0]), 1.6), .24 * fade)
    for k, s_ in enumerate([1, 2, 3, 2]):  # slow broken chord
        put(t + k * BEAT, keys(midi(CHORD[name][s_] + 12), 1.8), .11)
    if b >= 2:
        put(t, tabla_low(), .13)
        put(t + BEAT * 2, tabla_high(), .1)
        put(t + BEAT * 3.5, tabla_high(), .06)
    if b % 4 == 0 and b >= 4:
        for off, m, ln in THEME[:4]:
            tt = t + off * BEAT
            if tt < END - 1:
                put(tt, bansuri(midi(m), ln * BEAT * .96), .06)
    t += BEAT * 4
    b += 1

# ---- sign-off: one quiet resolved chord ----
for i, m in enumerate([60, 64, 67, 72]):
    put(END + i * .1, keys(midi(m), 2.2), .15)
put(END, bass(midi(36), 2.0), .28)
put(END, strings([midi(m) for m in (60, 64, 67, 72)], 60 - END, .2), .12)
out[int(59.3 * SR):] *= np.linspace(1, 0, N - int(59.3 * SR))
q = np.percentile(np.abs(out), 99.5)
np.save(ROOT / "jingle.npy", np.tanh(out / q * .8))
print("ok")
