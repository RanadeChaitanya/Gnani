import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { getMic, startCapture } from "../audio/capture";
import { api, ApiError, AppConfig, getConfig, loadSession, NotePayload, RoomState, Segment } from "../lib/api";
import { useT } from "../lib/i18n";
import type { Call } from "../lib/livekit";
import { saveNote } from "../lib/notesDb";

type Provisional = { id: string; text: string; latency_ms: number };
const wsUrl = (path: string) => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;

/** Renders the notice's **bold** markers without HTML injection. */
function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <p key={i}>
          {line.split(/\*\*(.+?)\*\*/g).map((part, j) => (j % 2 ? <strong key={j}>{part}</strong> : <Fragment key={j}>{part}</Fragment>))}
        </p>
      ))}
    </>
  );
}

export default function RoomPage() {
  const { code = "" } = useParams();
  const session = loadSession(code);
  if (!session) return <Navigate to={`/setup?mode=join&code=${code}`} replace />;
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
  const [noticeLang, setNoticeLang] = useState<"en" | "hi">("en");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const stats = useRef({ gnani: [] as number[], eos: [] as number[], dropped: 0, reconnects: 0, used: 0, limit: 0, lastLoud: 0, frames: 0 });
  const ctxRef = useRef<AudioContext | null>(null);
  const callRef = useRef<Call | null>(null);
  const micRef = useRef<MediaStreamTrack | null>(null);
  const sttRef = useRef<WebSocket | null>(null);
  const stopCapRef = useRef<(() => void) | null>(null);
  const pausedRef = useRef(false);
  const wantRef = useRef(false);
  const endedNav = useRef(false);

  useEffect(() => {
    getConfig().then(setCfg).catch((e) => setErr(e.message));
  }, []);

  // ---------- room events ----------
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onRoomEvent = useCallback(async (m: Record<string, any>) => {
    switch (m.type) {
      case "room_state":
        setState(m as unknown as RoomState);
        break;
      case "capture_state":
        setCapture(m.active);
        if (m.active) setStartedAt((s) => s ?? Date.now());
        if (!m.active && m.reason === "consent_revoked") setInfo(m.by === me ? "You stopped transcription." : "The other person stopped transcription.");
        if (!m.active && m.reason === "budget") setErr("This room used its transcription budget. End the call to get the note.");
        break;
      case "processing":
        setSpeaking((s) => ({ ...s, [m.participant_id]: Date.now() }));
        break;
      case "segment":
        setSegments((s) => [...s.filter((x) => x.seq !== m.seq), m as Segment].sort((a, b) => a.seq - b.seq));
        setProv((p) => p.filter((x) => x.id !== m.upstream_segment_id));
        setSpeaking((s) => ({ ...s, [m.participant_id]: 0 }));
        break;
      case "note_status":
        if (m.status === "pending") setNoteMsg({ text: t("noteMaking") });
        break;
      case "note_ready": {
        const n = await saveNote(m.note as NotePayload);
        setNoteMsg({ id: n.id, text: n.status === "ready" ? t("noteSaved") : `Note failed: ${n.error}` });
        if (n.kind === "final" && !endedNav.current) {
          endedNav.current = true;
          nav(`/notes/${n.id}`);
        }
        break;
      }
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

  // ---------- my STT pipeline ----------
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
    if (!cfg) return;
    wantRef.current = true;
    if (!window.isSecureContext) return setErr(t("insecure"));
    try {
      ctxRef.current ??= new AudioContext();
      micRef.current ??= callRef.current?.mic ?? (await getMic(cfg.mic));
    } catch {
      return setErr(t("micDenied"));
    }
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
        if (pausedRef.current) ws.send('{"type":"pause"}');
        stopCapRef.current = await startCapture(
          ctxRef.current!,
          micRef.current!,
          (frame) => {
            if (ws.readyState !== WebSocket.OPEN || pausedRef.current) return;
            if (ws.bufferedAmount > 65536) return void stats.current.dropped++; // never block on a slow link
            ws.send(frame);
            stats.current.frames++;
          },
          (rms) => {
            if (rms > 0.02) stats.current.lastLoud = Date.now();
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "level", rms }));
          },
        );
      } else if (m.type === "transcript") {
        stats.current.gnani.push(m.latency_ms);
        if (stats.current.lastLoud) stats.current.eos.push(Date.now() - stats.current.lastLoud);
        setProv((p) => [...p, { id: m.upstream_segment_id, text: m.text, latency_ms: m.latency_ms }]);
      } else if (m.type === "partial") {
        setSpeaking((s) => ({ ...s, [me]: Date.now() }));
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
      if (wantRef.current && !final && attempt < 5) setTimeout(() => wantRef.current && startStt(attempt + 1), 1000 * 2 ** attempt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, code]);

  const myConsent = state?.participants.find((p) => p.id === me)?.consent;
  useEffect(() => {
    if (capture && myConsent === "granted" && cfg) startStt();
    else stopStt();
    return stopStt;
  }, [capture, myConsent, cfg, startStt, stopStt]);

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

  // wake lock while capturing
  useEffect(() => {
    if (!capture || hidden || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release();
  }, [capture, hidden]);

  // timer + speaking indicator refresh
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(i);
  }, []);

  // full teardown on leave
  useEffect(() => () => {
    stopStt();
    callRef.current?.room.disconnect();
    micRef.current?.stop();
    ctxRef.current?.close();
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

  async function agree() {
    // user gesture: unlock audio and join the voice call now
    ctxRef.current ??= new AudioContext();
    ctxRef.current.resume();
    await call("/consent", "POST", { action: "grant", notice_version: session.notice.version });
    if (session.call && !callRef.current && cfg) {
      try {
        const { joinCall } = await import("../lib/livekit"); // ~550 kB, only when there is a call
        callRef.current = await joinCall(session.call.url, session.call.token, cfg.mic, setQuality, setAudioBlocked);
        micRef.current = callRef.current.mic;
      } catch {
        setInfo("Voice call couldn't connect; captions still work if you use another call.");
      }
    }
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    await callRef.current?.room.localParticipant.setMicrophoneEnabled(!next);
  }

  async function end() {
    await call("/end");
    stopStt();
    callRef.current?.room.disconnect();
    callRef.current = null;
  }

  async function share() {
    const url = `${location.origin}/join/${code}`;
    if (navigator.share) await navigator.share({ title: "Join my Saar call", url }).catch(() => {});
    else {
      await navigator.clipboard.writeText(url);
      setInfo(t("copied"));
    }
  }

  // ---------- render ----------
  if (!state) return <p className="muted">Connecting…</p>;
  const parts = state.participants;
  const nameOf = (id: string) => parts.find((p) => p.id === id)?.name ?? "?";
  const visible = segments.filter((s) => debug || !s.possible_echo);
  const others = Object.entries(speaking).filter(([, ts]) => ts && Date.now() - ts < 4000).map(([id]) => nameOf(id));
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const canStart = state.all_consented && (state.solo || parts.length === 2);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

  const captions = (
    <section className="captions" aria-live="polite" aria-label="Live captions">
      {visible.map((s) => (
        <div key={s.seq} id={`seg-${s.seq}`} className={`bubble ${s.participant_id === me ? "mine" : ""} ${s.possible_echo ? "echo" : ""}`}>
          <div className="who"><span>{s.name}</span><span>#{s.seq}</span>{s.latency_ms ? <span>{s.latency_ms} ms</span> : null}</div>
          <div dir="auto" lang={s.lang_code}>{s.text}</div>
        </div>
      ))}
      {prov.map((p) => (
        <div key={p.id} className="bubble mine prov">
          <div className="who"><span>{nameOf(me)} ·</span><span>{p.latency_ms} ms</span></div>
          <div dir="auto">{p.text}</div>
        </div>
      ))}
      {others.length > 0 && <p className="muted">{others.join(", ")} {t("speaking")}</p>}
    </section>
  );

  const banners = (
    <>
      {err && <div className="error" role="alert">{err}</div>}
      {audioBlocked && <button className="primary" onClick={() => callRef.current?.room.startAudio()}>🔊 Tap to hear the other person</button>}
      {info && <div className="banner" role="status">{info}</div>}
      {noteMsg && (
        <div className="banner" role="status">
          {noteMsg.text} {noteMsg.id && <button className="small" onClick={() => nav(`/notes/${noteMsg.id}`)}>{t("open")}</button>}
        </div>
      )}
    </>
  );

  if (state.status === "ended")
    return (
      <>
        <h1>{t("ended")}</h1>
        {banners}
        {!noteMsg && segments.length > 0 && <p className="muted">{t("noteMaking")}</p>}
        <button onClick={() => nav("/notes")}>{t("notes")}</button>
        <button className="danger" onClick={() => call("/data", "DELETE")}>{t("deleteServer")}</button>
      </>
    );

  if (state.status === "active")
    return (
      <>
        <div className="callbar">
          <span className={`rec ${capture && myConsent === "granted" && !muted && !hidden ? "" : "off"}`}>
            {capture && !muted && !hidden ? t("transcribing") : t("paused")}
          </span>
          <span className="muted">{code} · {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>
          {quality && <span className="chip">{quality}</span>}
          {upstream && upstream !== "connected" && <span className="chip warn">{upstream}</span>}
          <button className="small" style={{ marginLeft: "auto" }} onClick={() => setDebug(!debug)} aria-pressed={debug}>{t("debug")}</button>
        </div>
        {banners}
        {hidden && <div className="banner">{t("keepOpen")}</div>}
        {!state.solo && segments.length === 0 && <p className="muted">{t("earphones")}</p>}
        {debug && (
          <pre className="debug">{[
            `Gnani latency avg ${avg(stats.current.gnani)} ms (n=${stats.current.gnani.length})`,
            `end-of-speech → caption (approx) avg ${avg(stats.current.eos)} ms`,
            `frames sent ${stats.current.frames}, client-dropped ${stats.current.dropped}`,
            `upstream ${upstream || "-"}, reconnects ${stats.current.reconnects}`,
            `segments ${segments.length} (echo-hidden ${segments.filter((s) => s.possible_echo).length})`,
            `room audio ${stats.current.used}/${stats.current.limit || cfg?.max_stt_seconds} s`,
          ].join("\n")}</pre>
        )}
        {captions}
        <div className="controls">
          <button onClick={toggleMute} aria-pressed={muted}>{muted ? t("unmute") : t("mute")}</button>
          <button onClick={() => call("/notes/quick")}>{t("quickNote")}</button>
          <button className="danger" onClick={() => call("/consent", "POST", { action: "revoke", notice_version: session.notice.version })}>{t("revoke")}</button>
          <button className="primary" onClick={end}>{t("end")}</button>
        </div>
      </>
    );

  // lobby + consent
  return (
    <>
      {!state.solo && (
        <div className="card row">
          <div className="grow"><div className="muted">{t("code")}</div><div className="code">{code}</div></div>
          <button onClick={share}>{t("share")}</button>
        </div>
      )}
      {banners}
      <ul className="card" aria-label="Participants" style={{ listStyle: "none", padding: 14 }}>
        {parts.map((p) => (
          <li key={p.id} className="row">
            <span className="grow">{p.name}{p.id === me ? " (you)" : ""} · {p.lang_code}</span>
            <span className={`chip ${p.consent === "granted" ? "" : "warn"}`}>
              {p.consent === "granted" ? `✔ ${t("agreed")}` : p.consent === "revoked" ? t("declined") : t("waiting")}
            </span>
          </li>
        ))}
        {!state.solo && parts.length < 2 && <li className="muted">Waiting for the other person to join…</li>}
      </ul>
      {myConsent !== "granted" && (
        <section className="card notice stack" aria-labelledby="notice-h">
          <div className="row">
            <h2 id="notice-h" className="grow">Consent · सहमति</h2>
            <button className="small" onClick={() => setNoticeLang(noticeLang === "en" ? "hi" : "en")}>{noticeLang === "en" ? "हिन्दी" : "English"}</button>
          </div>
          <div dir="auto"><Bold text={noticeLang === "en" ? session.notice.text_en : session.notice.text_hi} /></div>
          <div className="row">
            <button className="primary grow" onClick={agree}>{t("agree")}</button>
            <button className="grow" onClick={() => call("/consent", "POST", { action: "revoke", notice_version: session.notice.version })}>{t("disagree")}</button>
          </div>
        </section>
      )}
      {session.role === "host" ? (
        <button className="primary" disabled={!canStart} onClick={() => call("/start")}>
          {t("startTranscribing")}
        </button>
      ) : (
        myConsent === "granted" && <p className="muted">{t("hostStarts")}</p>
      )}
      {!canStart && <p className="muted">{t("needBoth")}</p>}
      {segments.length > 0 && captions}
      {segments.length > 0 && <button className="primary" onClick={end}>{t("end")}</button>}
    </>
  );
}
