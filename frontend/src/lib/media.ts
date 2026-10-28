// One mic capture per call, opened during the user's "Agree" tap (iOS needs a gesture for audio).
// The same track feeds the LiveKit call and the transcription worklet, so both hear exactly the same thing.
import { getMic } from "../audio/capture";
import { getConfig } from "./api";

export const media: { ctx: AudioContext | null; mic: MediaStreamTrack | null } = { ctx: null, mic: null };

/** Call from a click handler. Throws "denied" / "insecure" with a user-facing reason. */
export async function prepareMedia(): Promise<void> {
  if (!window.isSecureContext) throw new Error("insecure");
  media.ctx ??= new AudioContext();
  void media.ctx.resume();
  if (!media.mic || media.mic.readyState === "ended") {
    try {
      media.mic = await getMic((await getConfig()).mic);
    } catch {
      throw new Error("denied");
    }
  }
}

export function releaseMedia(): void {
  media.mic?.stop();
  media.mic = null;
  void media.ctx?.close();
  media.ctx = null;
}
