import workletUrl from "./pcm-worklet.ts?worker&url";

export type MicConfig = { aec: boolean; ns: boolean; agc: boolean };

const loaded = new WeakSet<AudioContext>();

/** Solo / no-call mode: open the mic directly. */
export async function getMic(cfg: MicConfig): Promise<MediaStreamTrack> {
  const s = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: cfg.aec, noiseSuppression: cfg.ns, autoGainControl: cfg.agc },
  });
  return s.getAudioTracks()[0];
}

/** Pipe one mic track through the pcm16k worklet. Returns a stop function. */
export async function startCapture(
  ctx: AudioContext,
  track: MediaStreamTrack,
  onFrame: (b: ArrayBuffer) => void,
  onLevel: (rms: number) => void,
): Promise<() => void> {
  if (!loaded.has(ctx)) {
    await ctx.audioWorklet.addModule(workletUrl);
    loaded.add(ctx);
  }
  await ctx.resume();
  const src = ctx.createMediaStreamSource(new MediaStream([track]));
  const node = new AudioWorkletNode(ctx, "pcm16k", { numberOfInputs: 1, numberOfOutputs: 1 });
  const sink = ctx.createGain();
  sink.gain.value = 0; // some browsers only run a worklet that reaches the destination
  src.connect(node).connect(sink).connect(ctx.destination);
  node.port.onmessage = (e) => (e.data instanceof ArrayBuffer ? onFrame(e.data) : onLevel(e.data.rms));
  return () => {
    node.port.onmessage = null;
    src.disconnect();
    node.disconnect();
    sink.disconnect();
  };
}
