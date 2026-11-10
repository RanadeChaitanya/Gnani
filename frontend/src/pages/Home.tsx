// The whole app on one screen: set up once → call someone → your notes.
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Consent from "../components/Consent";
import { EndIcon } from "../components/icons";
import { api, ApiError, getConfig, Language, saveSession, Session } from "../lib/api";
import { useT } from "../lib/i18n";
import { prepareMedia } from "../lib/media";
import { isFinal, listNotes, SavedNote } from "../lib/notesDb";
import { errText } from "./Join";
import { canPickContact, getProfile, people, pickContact, Person, Profile, rememberPerson, saveProfile } from "../lib/profile";

export default function Home({ onProfile }: { onProfile: (p: Profile) => void }) {
  const profile = getProfile();
  return profile ? <CallHome profile={profile} /> : <Setup onDone={onProfile} />;
}

export function useLanguages() {
  const [langs, setLangs] = useState<Language[]>([]);
  useEffect(() => void getConfig().then((c) => setLangs(c.languages)).catch(() => {}), []);
  return langs;
}

function Setup({ onDone }: { onDone: (p: Profile) => void }) {
  const { t } = useT();
  const langs = useLanguages();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lang, setLang] = useState("auto");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      onDone(await saveProfile(name, phone, lang));
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack gap-top" onSubmit={submit}>
      <label>{t("name")}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="name" /></label>
      <label>{t("yourMobile")}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="98765 43210" />
      </label>
      <details className="more">
        <summary>{t("autoLang")}</summary>
        <label>{t("language")}
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </details>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="primary giant" disabled={busy}>{busy ? "…" : t("continue")}</button>
    </form>
  );
}

/** Start a call (or a one-phone test) from inside the tap, so the mic and audio unlock on phones. */
export async function startCall(profile: Profile, to: Person | null): Promise<Session> {
  await prepareMedia();
  const body = { display_name: profile.name, lang_code: profile.lang };
  const s = to
    ? await api<Session>("/api/calls", { body: { ...body, to: to.phone }, token: profile.device_token })
    : await api<Session>("/api/rooms", { body: { ...body, solo: true } });
  saveSession(s);
  await api(`/api/rooms/${s.room_code}/consent`, { body: { action: "grant", notice_version: s.notice.version }, token: s.token });
  if (to) {
    rememberPerson(to);
    sessionStorage.setItem(`saar:callee:${s.room_code}`, JSON.stringify({ ...to, ringing: s.ringing }));
  }
  return s;
}

function CallHome({ profile }: { profile: Profile }) {
  const { t } = useT();
  const nav = useNavigate();
  const [picking, setPicking] = useState(false);
  const [number, setNumber] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<SavedNote[]>([]);
  useEffect(() => void listNotes().then(setNotes), []);

  async function call(to: Person | null) {
    setErr("");
    setBusy(true);
    try {
      const s = await startCall(profile, to);
      nav(`/room/${s.room_code}`);
    } catch (x) {
      setErr(errText(x, t));
    } finally {
      setBusy(false);
    }
  }
  async function fromContacts() {
    try {
      const p = await pickContact();
      if (p) await call(p);
    } catch {
      setErr(t("contactsBlocked"));
    }
  }

  return (
    <div className="stack">
      {!picking ? (
        <button className="call-giant" onClick={() => setPicking(true)}>
          <EndIcon size={64} />
          {t("call")}
        </button>
      ) : (
        <div className="stack gap-top">
          {canPickContact() && <button className="primary giant" disabled={busy} onClick={fromContacts}>{t("fromContacts")}</button>}
          {people().map((p) => (
            <button key={p.phone} className="person" disabled={busy} onClick={() => call(p)}>
              <span className="avatar">{/^\p{L}/u.test(p.name) ? p.name[0].toUpperCase() : "☎"}</span>
              <span className="grow"><strong>{p.name}</strong></span>
              <EndIcon size={22} />
            </button>
          ))}
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void call({ name: number, phone: number }); }}>
            <input className="number" value={number} onChange={(e) => setNumber(e.target.value)} inputMode="tel" required
              placeholder={t("typeNumber")} aria-label={t("typeNumber")} />
            <button className="primary giant" disabled={busy}>{busy ? "…" : t("call")}</button>
          </form>
          <Consent />
          <button className="linkish" onClick={() => setPicking(false)}>{t("cancel")}</button>
        </div>
      )}
      {err && <div className="error" role="alert">{err}</div>}

      {!picking && notes.length > 0 && (
        <div className="list">
          {notes.slice(0, 3).map((n) => (
            <Link key={n.id} to={`/notes/${n.id}`} className="note-row">
              <div className="grow note-title">{n.title}</div>
              <span className={`status ${isFinal(n) ? "ok" : "draft"}`}>{isFinal(n) ? t("confirmed") : t("draft")}</span>
            </Link>
          ))}
          <Link to="/records" className="btn big">{t("records")}</Link>
        </div>
      )}
      {!picking && (
        <div className="row center small-text">
          <button className="linkish" disabled={busy} onClick={() => call(null)}>{t("soloShort")}</button>
          <Link to="/records" className="muted">{t("records")}</Link>
          <Link to="/privacy" className="muted">{t("privacy")}</Link>
        </div>
      )}
    </div>
  );
}
