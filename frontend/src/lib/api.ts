// REST client + shared types (mirror backend §9).
export type Notice = { version: string; text_en: string; text_hi: string; sha256: string };
export type Language = { code: string; label: string; native: string };
export type AppConfig = {
  demo_mode: boolean;
  languages: Language[];
  max_stt_seconds: number;
  call_audio_provider: string;
  stt_partials: boolean;
  retention_hours: number;
  mic: { aec: boolean; ns: boolean; agc: boolean };
  notice: Notice;
  version: string;
};
export type Participant = { id: string; name: string; role: string; lang_code: string; consent: string };
export type RoomState = {
  status: "lobby" | "active" | "ended";
  participants: Participant[];
  all_consented: boolean;
  solo: boolean;
};
export type Session = {
  room_code: string;
  participant_id: string;
  token: string;
  role: "host" | "guest";
  solo: boolean;
  call: { url: string; token: string } | null;
  notice: Notice;
};
export type Segment = {
  seq: number;
  participant_id: string;
  name: string;
  text: string;
  lang_code: string;
  started_at: number;
  ended_at: number;
  upstream_segment_id: string;
  possible_echo: boolean;
  latency_ms?: number;
};
type Cited = { text: string; evidence: number[] };
export type NoteContent = {
  title: string;
  note_language: string;
  summary: string[];
  key_points: Cited[];
  decisions: Cited[];
  action_items: { task: string; owner: string | null; due: string | null; evidence: number[] }[];
  entities: Record<"people" | "organizations" | "places" | "dates" | "amounts", string[]>;
  open_questions: string[];
  uncertain_spans: { text: string; reason: string; evidence: number[] }[];
  conversation_languages: string[];
};
export type Flag = { field: string; value: string | number[]; reason: string };
export type NotePayload = {
  id: string;
  room_code: string;
  kind: "quick" | "final";
  status: "pending" | "ready" | "failed";
  created_at: string;
  model: string;
  error: string;
  participants: string[];
  langs: string[];
  note: NoteContent | null;
  faithfulness: { flag_count: number; flags: Flag[]; checked_count: number } | null;
  transcript: { seq: number; participant_id: string; name: string; text: string; started_at: number }[];
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "Can't reach the server. Check your connection.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data?.error?.code ?? "error", data?.error?.message ?? "Request failed");
  return data as T;
}

let configPromise: Promise<AppConfig> | null = null;
export const getConfig = () => (configPromise ??= api<AppConfig>("/api/config"));

// Current room sessions live in sessionStorage (per tab); the last one also in localStorage for Privacy delete.
export function saveSession(s: Session): void {
  sessionStorage.setItem(`saar:${s.room_code}`, JSON.stringify(s));
  localStorage.setItem("saar:last", JSON.stringify({ room_code: s.room_code, token: s.token }));
}
export function loadSession(code: string): Session | null {
  const raw = sessionStorage.getItem(`saar:${code}`);
  return raw ? (JSON.parse(raw) as Session) : null;
}
export function lastRoom(): { room_code: string; token: string } | null {
  const raw = localStorage.getItem("saar:last");
  return raw ? JSON.parse(raw) : null;
}
