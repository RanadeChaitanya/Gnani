"""One unbroken narrator take carries the ending; split it at its own pauses so the picture can follow."""
import json, pathlib, subprocess, wave
import numpy as np
ROOT = pathlib.Path(__file__).parent
(ROOT / "vo2").mkdir(exist_ok=True)
def rd(f):
    with wave.open(str(f)) as w:
        return w.getframerate(), np.frombuffer(w.readframes(w.getnframes()), np.int16)
def wr(f, sr, p):
    with wave.open(str(f), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(p.tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "vo/12.wav"), "-af", "atempo=1.03", str(ROOT / "tmp.wav")], check=True)
sr, pcm = rd(ROOT / "tmp.wav")
env = np.convolve(np.abs(pcm.astype(float)), np.ones(600) / 600, "same")
q = np.flatnonzero(env < 260)
runs = [r for r in np.split(q, np.flatnonzero(np.diff(q) > 1) + 1) if len(r) > .14 * sr and r[0] > sr and r[-1] < len(pcm) - 2000]
gaps = sorted(sorted(runs, key=len)[-3:], key=lambda r: r[0])
print("gaps", [(round(r[0] / sr, 2), round(len(r) / sr, 2)) for r in runs])
cuts = [0] + [int(r[0] + len(r) * .85) for r in gaps] + [len(pcm)]
parts = [pcm[cuts[i]:cuts[i + 1]] for i in range(4)]
EXTRA = {7: .3, 8: .2, 15: .5}
t, C = .15, []
for i in range(16):
    t += EXTRA.get(i, 0)
    out = ROOT / f"vo2/{i:02d}.wav"
    if i < 12:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / f"vo/{i:02d}.wav"), "-af", "atempo=1.03", str(out)], check=True)
    else:
        wr(out, sr, parts[i - 12])
    n = wave.open(str(out)).getnframes() / sr
    C.append([round(t, 3), round(t + n, 3)])
    t += n + (.12 if i < 12 else 0)
json.dump({"cues": C}, open(ROOT / "cues.json", "w"))
print(C, "end", C[-1][1])
