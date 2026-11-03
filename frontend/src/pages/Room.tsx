import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { Room as LkRoom } from "livekit-client";
import { getMic, startCapture } from "../audio/capture";
import { EndIcon, MicIcon, MicOffIcon, NoteIcon, StopIcon } from "../components/icons";
import { api, ApiError, AppConfig, getConfig, loadSession, NotePayload, RoomState, Segment } from "../lib/api";
import { useT } from "../lib/i18n";
import { media, prepareMedia, releaseMedia } from "../lib/media";
import { saveNote, SavedNote } from "../lib/notesDb";
import type { Person } from "../lib/profile";
import Review from "../components/Review";
import Wave from "../components/Wave";

type Provisional = { id: string; text: string; latency_ms: number };
const wsUrl = (path: string) => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;
const SILENT_RMS = 0.01;

export default function RoomPage() {
  const { code = "" } = useParams();
  if (!loadSession(code)) return <Navigate to={`/join/${code}`} replace />;
  return <Room code={code} />;
}

function Room({ code }: { code: string }) {
  const { t } = useT();
  const nav = useNavigate();
  const session = loadSession(code)!;
  const me = session.participant_id;
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [capture, setCapture] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [prov, setProv] = useState<Provisional[]>([]);
  const [partials, setPartials] = useState<Record<string, string>>({});
  const [speaking, setSpeaking] = useState<Record<string, number>>({});
  const [upstream, setUpstream] = useState("");
  const [muted, setMuted] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [noteMsg, setNoteMsg] = useState<{ id?: string; text: string } | null>(null);
  const [debug, setDebug] = useState(false);
  const [quality, setQuality] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [mediaReady, setMediaReady] = useState(!!media.mic);
  const [level, setLevel] = useState(0);
  const [qr, setQr] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const stats = useRef({ gnani: [] as number[], dropped: 0, reconnects: 0, used: 0, limit: 0, frames: 0, lastLoud: 0, capSince: 0, lastLevelSent: 0, lastFrame: 0, heals: 0, lastHeal: 0, lastDiag: 0 });
  const callRef = useRef<LkRoom | null>(null);
  const sttRef = useRef<WebSocket | null>(null);
  const stopCapRef = useRef<(() => void) | null>(null);
  const pausedRef = useRef(false);
  const levels = useRef<number[]>([]);
  const wantRef = useRef(false);
  const [finalNote, setFinalNote] = useState<SavedNote | null>(null);
  const [declined, setDeclined] = useState(false);
  const callee = JSON.parse(sessionStorage.getItem(`saar:callee:${code}`) ?? "null") as (Person & { ringing?: boolean }) | null;
  const autoStarted = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const joinUrl = `${location.origin}/join/${code}`;

  useEffect(() => void getConfig().then(setCfg).catch((e) => setErr(e.message)), []);
  useEffect(() => void QRCode.toDataURL(joinUrl, { margin: 1, width: 240 }).then(setQr), [joinUrl]);

  // ---------- room events ----------
  const onRoomEvent = useCallback(async (m: Record<string, any>) => {
    switch (m.type) {
      case "room_state":
        setState(m as unknown as RoomState);
        break;
      case "capture_state":
        setCapture(m.active);
        if (m.active) setStartedAt((s) => s ?? Date.now());
        if (!m.active && m.reason === "consent_revoked") setInfo(m.by === me ? "You stopped transcription." : "The other person stopped transcription.");
        if (!m.active && m.reason === "budget") setErr("This call used its transcription budget. End the call to get the note.");
        break;
      case "processing":
        setSpeaking((s) => ({ ...s, [m.participant_id]: Date.now() }));
        break;
      case "partial":
        setPartials((p) => ({ ...p, [m.participant_id]: m.text }));
        setSpeaking((s) => ({ ...s, [m.participant_id]: Date.now() }));
        break;
      case "segment":
        setSegments((s) => [...s.filter((x) => x.seq !== m.seq), m as Segment].sort((a, b) => a.seq - b.seq));
        setProv((p) => p.filter((x) => x.id !== m.upstream_segment_id));
        setPartials((p) => ({ ...p, [m.participant_id]: "" }));
        setSpeaking((s) => ({ ...s, [m.participant_id]: 0 }));
        break;
      case "note_status":
        if (m.status === "pending") setNoteMsg({ text: t("noteMaking") });
        break;
      case "note_ready": {
        const n = await saveNote(m.note as NotePayload);
        if (n.kind === "final") setFinalNote(n);
        else setNoteMsg({ id: n.id, text: n.status === "ready" ? t("noteSaved") : `${t("noteFailed")} ${n.error}` });
        break;
      }
      case "declined":
        setDeclined(true);
        break;
      case "usage":
        stats.current.used = m.stt_seconds_used;
        stats.current.limit = m.stt_seconds_limit;
        break;
      case "data_deleted":
        setSegments([]);
        setProv([]);
        setInfo("Server copy of this conversation was deleted.");
        break;
      case "error":
        setErr(m.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let ws: WebSocket;
    let alive = true;
    let retry = 0;
    const connect = () => {
      ws = new WebSocket(wsUrl(`/ws/room/${code}`));
      ws.onopen = () => {
        retry = 0;
        ws.send(JSON.stringify({ type: "auth", token: session.token }));
      };
      ws.onmessage = (e) => onRoomEvent(JSON.parse(e.data));
      ws.onclose = () => alive && setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
    };
    connect();
    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 15000);
    return () => {
      alive = false;
      clearInterval(ping);
      ws.close();
    };
  }, [code, session.token, onRoomEvent]);

  // ---------- voice call (LiveKit), publishing the same mic track transcription uses ----------
  useEffect(() => {
    if (!mediaReady || !session.call || !cfg || callRef.current) return;
    let cancelled = false;
    import("../lib/livekit") // ~550 kB, only when there is a call
      .then(({ joinCall }) => joinCall(session.call!.url, session.call!.token, media.mic!, setQuality, setAudioBlocked))
      .then((room) => {
        if (cancelled) void room.disconnect(false); // keep our mic track alive for transcription
        else callRef.current = room;
      })
      .catch(() => setInfo("Voice call couldn't connect — captions still work."));
    return () => void (cancelled = true);
  }, [mediaReady, session.call, cfg]);

  // ---------- my transcription pipeline ----------
  const stopStt = useCallback(() => {
    wantRef.current = false;
    stopCapRef.current?.();
    stopCapRef.current = null;
    const ws = sttRef.current;
    sttRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send('{"type":"stop"}');
    ws?.close();
  }, []);

  const startStt = useCallback(async (attempt = 0) => {
    if (!media.ctx || !media.mic || media.mic.readyState === "ended") return setMediaReady(false); // show "Connect microphone"
    wantRef.current = true;
    const ws = new WebSocket(wsUrl(`/ws/stt/${code}`));
    ws.binaryType = "arraybuffer";
    sttRef.current = ws;
    let final = false;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: session.token }));
      ws.send(JSON.stringify({ type: "start", sample_rate: 16000, client_ts: Date.now() }));
    };
    ws.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "ready") {
        setUpstream("connected");
        stats.current.capSince = stats.current.lastFrame = Date.now();
        if (pausedRef.current) ws.send('{"type":"pause"}');
        stopCapRef.current = await startCapture(media.ctx!, media.mic!,
          (frame) => {
            stats.current.lastFrame = Date.now();
            if (ws.readyState !== WebSocket.OPEN || pausedRef.current) return;
            if (ws.bufferedAmount > 65536) return void stats.current.dropped++; // never block on a slow link
            ws.send(frame);
            stats.current.frames++;
          },
          (rms) => {
            setLevel(rms);
            levels.current = [...levels.current.slice(-40), rms];
            if (rms > SILENT_RMS) stats.current.lastLoud = Date.now();
            if (Date.now() - stats.current.lastLevelSent > 500 && ws.readyState === WebSocket.OPEN) {
              stats.current.lastLevelSent = Date.now();
              ws.send(JSON.stringify({ type: "level", rms }));
            }
          });
      } else if (m.type === "transcript") {
        stats.current.gnani.push(m.latency_ms);
        setProv((p) => [...p, { id: m.upstream_segment_id, text: m.text, latency_ms: m.latency_ms }]);
        setPartials((p) => ({ ...p, [me]: "" }));
      } else if (m.type === "upstream_status") {
        setUpstream(m.state);
        if (m.state === "reconnecting") stats.current.reconnects++;
        if (m.state === "failed") setErr("Speech service unavailable — transcription is stopped, not running silently.");
      } else if (m.type === "stopped") {
        final = m.reason !== "client" && m.reason !== "error";
      } else if (m.type === "error" && m.code !== "upstream_error") {
        setErr(m.message);
        final = true;
      }
    };
    ws.onclose = () => {
      stopCapRef.current?.();
      stopCapRef.current = null;
      if (sttRef.current === ws) sttRef.current = null;
      if (wantRef.current && !final && attempt < 5) setTimeout(() => wantRef.current && !sttRef.current && startStt(attempt + 1), 1000 * 2 ** attempt);
    };
  }, [code, session.token, me]);

  const myConsent = state?.participants.find((p) => p.id === me)?.consent;
  useEffect(() => {
    if (capture && myConsent === "granted" && mediaReady) startStt();
    else stopStt();
    return stopStt;
  }, [capture, myConsent, mediaReady, startStt, stopStt]);

  // host starts transcription automatically once everyone has agreed (the host agreed to exactly that)
  const parts = state?.participants ?? [];
  const canStart = !!state && state.all_consented && (state.solo || parts.length === 2);
  useEffect(() => {
    if (state?.status !== "lobby") return void (autoStarted.current = false);
    if (session.role === "host" && canStart && !autoStarted.current) {
      autoStarted.current = true;
      api(`/api/rooms/${code}/start`, { body: {}, token: session.token }).catch((e) => {
        autoStarted.current = false;
        setErr(e instanceof ApiError ? e.message : String(e));
      });
    }
  }, [state, canStart, code, session.role, session.token]);

  // Phones can silently stop our mic pipeline (the call switching the audio mode, iOS interruptions, the OS
  // killing the track). Seen in real tests as one side sending 0 s of audio. Detect it and rebuild it.
  const healMic = useCallback(async () => {
    const s = stats.current;
    s.heals++;
    s.lastHeal = Date.now();
    stopStt();
    try {
      if (!media.mic || media.mic.readyState === "ended") {
        media.mic = await getMic((await getConfig()).mic);
        if (callRef.current) await (await import("../lib/livekit")).replaceCallMic(callRef.current, media.mic);
      }
      void media.ctx?.close();
      media.ctx = new AudioContext();
      await media.ctx.resume().catch(() => {});
    } catch {
      return setMediaReady(false); // shows "Connect microphone"
    }
    void startStt();
  }, [startStt, stopStt]);
  const stalled = capture && !muted && !hidden && !!stopCapRef.current && Date.now() - stats.current.lastFrame > 2500;
  useEffect(() => {
    if (!capture) return;
    const i = setInterval(() => {
      const s = stats.current;
      const now = Date.now();
      if (stopCapRef.current && !pausedRef.current && now - s.lastFrame > 2500 && now - s.lastHeal > 6000) void healMic();
      const ws = sttRef.current;
      if (ws?.readyState === WebSocket.OPEN && now - s.lastDiag >= 5000 && (s.lastDiag = now))
        ws.send(JSON.stringify({ type: "diag", ctx: media.ctx?.state, track: media.mic?.readyState, muted: media.mic?.muted,
          heals: s.heals, frames: s.frames, dropped: s.dropped, hidden: document.visibilityState === "hidden",
          ua: /iPhone|iPad/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "other" }));
    }, 1000);
    return () => clearInterval(i);
  }, [capture, healMic]);

  // mute / background → pause (no silence is streamed, nothing is billed)
  useEffect(() => {
    pausedRef.current = muted || hidden;
    const ws = sttRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: pausedRef.current ? "pause" : "resume" }));
  }, [muted, hidden]);
  useEffect(() => {
    const f = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  useEffect(() => {
    if (!capture || hidden || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release();
  }, [capture, hidden]);
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(i);
  }, []);
  // reopened after the call ended (or the note arrived while away): fetch the final note
  useEffect(() => {
    if (state?.status !== "ended" || finalNote) return;
    api<{ id: string; kind: string }[]>(`/api/rooms/${code}/notes`, { token: session.token })
      .then((l) => l.find((x) => x.kind === "final"))
      .then((f) => f && api<NotePayload>(`/api/notes/${f.id}`, { token: session.token }).then(saveNote).then(setFinalNote))
      .catch(() => {});
  }, [state?.status, finalNote, code, session.token]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" }); // newer Chrome returns a Promise here: never return it as cleanup
  }, [segments.length, prov.length, partials]);
  useEffect(() => () => {
    stopStt();
    callRef.current?.disconnect();
    releaseMedia();
  }, [stopStt]);

  // ---------- actions ----------
  const call = async <T,>(path: string, method = "POST", body: unknown = {}) => {
    setErr("");
    try {
      return await api<T>(`/api/rooms/${code}${path}`, { method, body: method === "POST" ? body : undefined, token: session.token });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
      return null;
    }
  };
  const consent = (action: "grant" | "revoke") => call("/consent", "POST", { action, notice_version: session.notice.version });

  async function connectAudio() {
    try {
      await prepareMedia();
      setMediaReady(true);
    } catch (x) {
      setErr(t((x as Error).message === "insecure" ? "insecure" : "micDenied"));
    }
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (callRef.current) {
      const { setCallMuted } = await import("../lib/livekit");
      await setCallMuted(callRef.current, next);
    } else if (media.mic) media.mic.enabled = !next;
  }

  async function end() {
    await call("/end");
    stopStt();
    callRef.current?.disconnect();
    callRef.current = null;
  }

  async function share() {
    if (navigator.share) await navigator.share({ title: "Join my Saar call", url: joinUrl }).catch(() => {});
    else {
      await navigator.clipboard.writeText(joinUrl);
      setInfo(t("copied"));
    }
  }

  // ---------- render ----------
  if (!state) return <p className="muted center">{t("joining")}</p>;
  const other = parts.find((p) => p.id !== me);
  const nameOf = (id: string) => parts.find((p) => p.id === id)?.name ?? "?";
  const visible = segments.filter((s) => debug || !s.possible_echo);
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const live = capture && myConsent === "granted" && !muted && !hidden;
  const silent = live && stats.current.capSince > 0 && Date.now() - stats.current.capSince > 4000 && Date.now() - stats.current.lastLoud > 4000;
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

  const banners = (
    <>
      {!mediaReady && <button className="primary big" onClick={connectAudio}>🎙️ Connect microphone</button>}
      {err && <div className="error" role="alert">{err}</div>}
      {audioBlocked && <button className="primary" onClick={() => callRef.current?.startAudio()}>🔊 {t("tapAudio")}</button>}
      {stalled ? (
        <div className="banner warn row" role="alert">
          <span className="grow">🎙️ {t("micStalled")}</span>
          <button className="small primary" onClick={() => void healMic()}>{t("fixMic")}</button>
        </div>
      ) : silent && <div className="banner warn" role="alert">🎙️ {t("micSilent")}</div>}
      {hidden && <div className="banner">{t("keepOpen")}</div>}
      {info && <div className="banner" role="status">{info}</div>}
      {noteMsg && (
        <div className="banner ok" role="status">
          {noteMsg.text} {noteMsg.id && <button className="small" onClick={() => nav(`/notes/${noteMsg.id}`)}>{t("open")}</button>}
        </div>
      )}
    </>
  );

  if (state.status === "ended")
    return finalNote ? <Review n={finalNote} me={me} token={session.token} names={Object.fromEntries(parts.map((p) => [p.id, p.name]))} />
      : (
      <div className="ring-screen">
        <h1>{t("ended")}</h1>
        {banners}
        <p className="muted center">{segments.length || capture ? t("noteMaking") : t("noNoteNothingSaid")}</p>
        <button className="big" onClick={() => nav("/")}>{t("home")}</button>
      </div>
    );

  const calleeName = other?.name ?? callee?.name ?? t("theOtherPerson");
  const initial = /^\p{L}/u.test(calleeName) ? calleeName[0].toUpperCase() : "☎";
  if (declined)
    return (
      <div className="ring-screen">
        <div className="avatar xl">{calleeName[0]?.toUpperCase()}</div>
        <h1>{t("declinedTitle").replace("{name}", calleeName)}</h1>
        <button className="primary big" onClick={() => nav("/")}>{t("home")}</button>
      </div>
    );

  if (state.status === "lobby") {
    const digits = (callee?.phone ?? "").replace(/\D/g, "").slice(-10);
    const invite = `${t("inviteText").replace("{name}", session.role === "host" ? parts[0]?.name ?? "" : "")} ${joinUrl}`;
    const cancel = async () => {
      await api(`/api/calls/${code}/cancel`, { body: {} }).catch(() => {});
      await call("/end");
      nav("/");
    };
    return (
      <div className="ring-screen">
        {banners}
        {myConsent !== "granted" ? (
          <>
            <h1>{t("needConsent")}</h1>
            <button className="primary big" onClick={() => consent("grant")}>{t("agree")}</button>
            <button className="big" onClick={() => nav("/")}>{t("disagree")}</button>
          </>
        ) : !state.solo && parts.length < 2 ? (
          <>
            <div className="avatar xl pulse">{initial}</div>
            <p className="muted">{callee?.ringing ? t("ringing") : t("notOnSaar")}</p>
            <h1>{calleeName}</h1>
            {callee?.phone && callee.phone !== calleeName && <p className="muted">{callee.phone}</p>}
            {!callee?.ringing && (
              <div className="stack full">
                <p className="center">{t("sendInvite")}</p>
                <a className="btn primary big" href={`https://wa.me/${digits ? "91" + digits : ""}?text=${encodeURIComponent(invite)}`} target="_blank" rel="noopener noreferrer">{t("inviteWhatsApp")}</a>
                <a className="btn big" href={`sms:${digits ? "+91" + digits : ""}?body=${encodeURIComponent(invite)}`}>{t("inviteSms")}</a>
                <button className="big" onClick={share}>{t("inviteOther")}</button>
                <details className="more">
                  <summary>{t("nextToYou")}</summary>
                  {qr && <img src={qr} width={220} height={220} alt={t("qrAlt")} className="qr" />}
                </details>
              </div>
            )}
            <p className="muted small-text center">{t("earphones")}</p>
            <button className="big danger" onClick={cancel}><EndIcon size={20} /> {t("cancelCall")}</button>
          </>
        ) : (
          <>
            <div className="avatar xl pulse">{state.solo ? "🎙️" : calleeName[0]?.toUpperCase()}</div>
            <h1>{t("connecting")}</h1>
          </>
        )}
      </div>
    );
  }

  const others = Object.entries(speaking).filter(([id, ts]) => id !== me && ts && Date.now() - ts < 4000).map(([id]) => nameOf(id));
  return (
    <div className="callscreen">
      <div className="call-hero">
        <div className="callname">{state.solo ? t("solo") : other?.name ?? t("waitingFor")}</div>
        <span className={`rec ${live ? "" : "off"}`}>{live ? t("transcribing") : t("paused")}</span>
        <div className="timer">{clock}</div>
        <div className="muted small-text">
          {state.solo ? "" : other ? (other.online ? t("online") : t("away")) : code}
          {quality && ` · ${quality}`}
        </div>
        <Wave levels={live ? levels.current : []} bars={31} />
      </div>
      {banners}
      {upstream && upstream !== "connected" && <div className="banner">Transcription: {upstream}…</div>}
      {debug && (
        <pre className="debug">{[
          `Gnani latency avg ${avg(stats.current.gnani)} ms (n=${stats.current.gnani.length})`,
          `frames sent ${stats.current.frames}, dropped ${stats.current.dropped}, mic level ${level.toFixed(3)}`,
          `upstream ${upstream || "-"}, reconnects ${stats.current.reconnects}`,
          `segments ${segments.length} (echo hidden ${segments.filter((s) => s.possible_echo).length})`,
          `audio used ${stats.current.used}/${stats.current.limit || cfg?.max_stt_seconds} s`,
        ].join("\n")}</pre>
      )}
      <section className="captions captions-card" aria-live="polite" aria-label="Live captions">
        {visible.length === 0 && prov.length === 0 && <p className="muted center">Start talking — captions appear here on both phones.</p>}
        {visible.map((s) => (
          <div key={s.seq} id={`seg-${s.seq}`} className={`bubble ${s.participant_id === me ? "mine" : ""} ${s.possible_echo ? "echo" : ""}`}>
            <div className="who">{s.name}</div>
            <div dir="auto" lang={s.lang_code}>{s.text}</div>
          </div>
        ))}
        {prov.map((p) => (
          <div key={p.id} className="bubble mine prov"><div className="who">{nameOf(me)}</div><div dir="auto">{p.text}</div></div>
        ))}
        {Object.entries(partials).filter(([, txt]) => txt).map(([pid, txt]) => (
          <div key={`p-${pid}`} className={`bubble live ${pid === me ? "mine" : ""}`} aria-hidden="true">
            <div className="who">{nameOf(pid)} …</div><div dir="auto">{txt}</div>
          </div>
        ))}
        {others.length > 0 && !Object.values(partials).some(Boolean) && <p className="muted">{others.join(", ")} {t("speaking")}</p>}
        <div ref={bottom} />
      </section>
      <nav className="controls" aria-label="Call controls">
        <button className={`ctl ${muted ? "on" : ""}`} onClick={toggleMute} aria-pressed={muted}>
          <span className="ring" style={{ boxShadow: muted ? "none" : `0 0 0 ${Math.min(8, level * 120)}px var(--accent-soft)` }}>
            {muted ? <MicOffIcon /> : <MicIcon />}
          </span>{muted ? t("unmute") : t("mute")}
        </button>
        <button className="ctl" onClick={() => call("/notes/quick")}><span className="ring"><NoteIcon /></span>{t("quickNote")}</button>
        <button className="ctl" onClick={() => consent("revoke")}><span className="ring"><StopIcon /></span>{t("revoke")}</button>
        <button className="ctl end" onClick={end}><span className="ring"><EndIcon /></span>{t("end")}</button>
      </nav>
      <button className="linkish" onClick={() => setDebug(!debug)} aria-pressed={debug}>{t("debug")}</button>
    </div>
  );
}
