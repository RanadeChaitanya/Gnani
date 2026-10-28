import { describe, expect, it } from "vitest";
import { FRAME_SAMPLES, Framer, OUT_RATE, Resampler } from "./resampler";

function sine(freq: number, rate: number, seconds: number): Float32Array {
  const n = Math.round(rate * seconds);
  return Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * freq * i) / rate));
}

function rms(x: ArrayLike<number>, skip = 200): number {
  let s = 0;
  for (let i = skip; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / (x.length - skip));
}

/** Feed in 128-sample render quanta like an AudioWorklet does. */
function run(r: Resampler, input: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < input.length; i += 128) out.push(...r.process(input.subarray(i, i + 128)));
  return out;
}

describe.each([48000, 44100])("Resampler from %i Hz", (rate) => {
  it("produces 16 kHz output length", () => {
    const out = run(new Resampler(rate), sine(1000, rate, 1));
    expect(Math.abs(out.length - OUT_RATE)).toBeLessThanOrEqual(2);
  });

  it("passes 1 kHz and 7 kHz (in band)", () => {
    for (const f of [1000, 7000]) {
      const ratio = rms(run(new Resampler(rate), sine(f, rate, 0.5))) / (0.5 / Math.SQRT2);
      expect(ratio).toBeGreaterThan(f === 1000 ? 0.95 : 0.5);
    }
  });

  it("suppresses 12 kHz, which would alias to 4 kHz without the low-pass", () => {
    const ratio = rms(run(new Resampler(rate), sine(12000, rate, 0.5))) / (0.5 / Math.SQRT2);
    expect(ratio).toBeLessThan(0.05);
  });
});

describe("Framer", () => {
  it("emits exactly 1,024-byte frames and keeps the remainder", () => {
    const f = new Framer();
    const frames = f.push(new Array(FRAME_SAMPLES * 2 + 100).fill(0.25));
    expect(frames).toHaveLength(2);
    for (const b of frames) expect(b.byteLength).toBe(1024);
    expect(f.push(new Array(FRAME_SAMPLES - 100).fill(0))).toHaveLength(1);
  });

  it("clamps and scales to int16 little-endian", () => {
    const [b] = new Framer().push([2, -2, 0.5, ...new Array(FRAME_SAMPLES - 3).fill(0)]);
    const v = new DataView(b);
    expect([v.getInt16(0, true), v.getInt16(2, true), v.getInt16(4, true)]).toEqual([32767, -32767, 16384]);
  });
});
