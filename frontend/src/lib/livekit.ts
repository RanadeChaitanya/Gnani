import { ConnectionQuality, Room, RoomEvent, Track } from "livekit-client";
import type { MicConfig } from "../audio/capture";

export type Call = { room: Room; mic: MediaStreamTrack };

/** Join the audio-only app-to-app call and publish the mic. Must run after a user gesture. */
export async function joinCall(
  url: string,
  token: string,
  mic: MicConfig,
  onQuality: (q: string) => void,
  onAudioBlocked: (blocked: boolean) => void,
): Promise<Call> {
  const room = new Room({
    audioCaptureDefaults: { echoCancellation: mic.aec, noiseSuppression: mic.ns, autoGainControl: mic.agc },
  });
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach());
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
  room.on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p) => {
    if (p.isLocal) onQuality(q);
  });
  // iOS may block playback if the tap's activation expired during the awaits below; the UI offers a tap
  room.on(RoomEvent.AudioPlaybackStatusChanged, () => onAudioBlocked(!room.canPlaybackAudio));
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  await room.startAudio().catch(() => {});
  onAudioBlocked(!room.canPlaybackAudio);
  const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
  if (!track) throw new Error("Microphone track not available");
  return { room, mic: track };
}
