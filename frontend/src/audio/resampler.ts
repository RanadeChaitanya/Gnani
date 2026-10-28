/**
 * Anti-aliased resampling to 16 kHz + exact 1,024-byte PCM s16le framing (spec §11.1).
 *
 * One method for every input rate: a 63-tap windowed-sinc (Hamming) low-pass at 7.2 kHz, then linear
 * interpolation at the output instants. For 48 kHz that is FIR + decimate-by-3; for 44.1 kHz the
 * low-pass makes linear interpolation safe. Pure code so it runs in the worklet and in unit tests.
 */
export const OUT_RATE = 16000;
export const FRAME_SAMPLES = 512;

export function lowpass(taps: number, cutoffHz: number, rate: number): Float32Array {
  const h = new Float32Array(taps);
  const fc = cutoffHz / rate;
  const mid = (taps - 1) / 2;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - mid;
    const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    h[i] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)));
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum; // unity DC gain
  return h;
}

export class Resampler {
  private readonly h: Float32Array | null;
  private readonly hist: Float32Array;
  private hi = 0;
  private readonly step: number;
  private n = -1; // index of the latest filtered sample
  private prev = 0;
  private t = 0; // next output instant, in input-sample units

  constructor(readonly inRate: number, taps = 63) {
    this.step = inRate / OUT_RATE;
    this.h = inRate === OUT_RATE ? null : lowpass(taps, 0.45 * OUT_RATE, inRate);
    this.hist = new Float32Array(taps);
  }

  process(input: Float32Array): number[] {
    if (!this.h) return Array.from(input);
    const out: number[] = [];
    const { h, hist } = this;
    const L = h.length;
    for (let k = 0; k < input.length; k++) {
      hist[this.hi] = input[k];
      this.hi = (this.hi + 1) % L;
      let y = 0;
      for (let j = 0, idx = this.hi; j < L; j++, idx = (idx + 1) % L) y += h[j] * hist[idx];
      this.n++;
      while (this.t <= this.n) {
        const frac = this.t - (this.n - 1);
        out.push(this.prev + (y - this.prev) * frac);
        this.t += this.step;
      }
      this.prev = y;
    }
    return out;
  }
}

/** Collects float samples and emits exact 512-sample (1,024-byte) Int16 little-endian frames. */
export class Framer {
  private buf = new Int16Array(FRAME_SAMPLES);
  private fill = 0;

  push(samples: ArrayLike<number>): ArrayBuffer[] {
    const frames: ArrayBuffer[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      this.buf[this.fill++] = Math.round(s * 32767);
      if (this.fill === FRAME_SAMPLES) {
        frames.push(this.buf.buffer); // Int16Array is little-endian on every platform browsers run on
        this.buf = new Int16Array(FRAME_SAMPLES);
        this.fill = 0;
      }
    }
    return frames;
  }
}
