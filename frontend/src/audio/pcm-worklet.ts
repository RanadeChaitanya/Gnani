/// <reference lib="webworker" />
// AudioWorklet: own mic → 16 kHz → 1,024-byte frames posted to the main thread; RMS every 100 ms.
import { Framer, Resampler } from "./resampler";

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class Pcm16k extends AudioWorkletProcessor {
  private r = new Resampler(sampleRate);
  private f = new Framer();
  private sq = 0;
  private count = 0;

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (const b of this.f.push(this.r.process(ch))) this.port.postMessage(b, [b]);
    for (let i = 0; i < ch.length; i++) this.sq += ch[i] * ch[i];
    this.count += ch.length;
    if (this.count >= sampleRate / 10) {
      this.port.postMessage({ rms: Math.sqrt(this.sq / this.count) });
      this.sq = this.count = 0;
    }
    return true;
  }
}

registerProcessor("pcm16k", Pcm16k);
