import { AudioPresets, ConnectionQuality, Room, RoomEvent, Track } from "livekit-client";

/** Join the audio-only app-to-app call, publishing OUR mic track (the one transcription also uses). */
export async function joinCall(
  url: string,
  token: string,
  mic: MediaStreamTrack,
  onQuality: (q: string) => void,
  onAudioBlocked: (blocked: boolean) => void,
): Promise<Room> {
  const room = new Room();
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
  // Opus at 48 kbps with redundant packets (RED) for loss; DTX off so word starts are never clipped by silence suppression
  await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone, audioPreset: AudioPresets.music, red: true, dtx: false });
  await room.startAudio().catch(() => {});
  onAudioBlocked(!room.canPlaybackAudio);
  return room;
}

export async function setCallMuted(room: Room, muted: boolean): Promise<void> {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  if (pub?.track) await (muted ? pub.track.mute() : pub.track.unmute());
}

/** After the phone killed our mic track, put the fresh one into the call too. */
export async function replaceCallMic(room: Room, mic: MediaStreamTrack): Promise<void> {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  if (pub?.track) await pub.track.replaceTrack(mic, true);
}
