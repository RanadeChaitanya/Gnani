// The whole app on one screen: set up once → call someone → your notes.
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MicIcon } from "../components/icons";
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

function Steps() {
  const { t } = useT();
  return (
    <ol className="steps">
      <li><b>1</b><span>{t("step1")}</span></li>
      <li><b>2</b><span>{t("step2")}</span></li>
      <li><b>3</b><span>{t("step3")}</span></li>
      <li><b>4</b><span>{t("step4")}</span></li>
    </ol>
  );
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
  const [lang, setLang] = useState("hi-IN");
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
    <form className="stack" onSubmit={submit}>
      <div className="greet"><h1>{t("welcome")}</h1><p className="muted">{t("welcomeSub")}</p></div>
      <Steps />
      <section className="card stack">
        <h2>{t("setupOnce")}</h2>
        <label>{t("name")}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="name" /></label>
        <label>{t("yourMobile")}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="98765 43210" />
        </label>
        <label>{t("speak")}
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        {err && <div className="error" role="alert">{err}</div>}
        <button className="primary big" disabled={busy}>{busy ? "…" : t("continue")}</button>
        <p className="muted small-text">{t("numberPrivacy")}</p>
      </section>
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
      <div className="greet">
        <div className="muted">{t(new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening")}, {profile.name}</div>
        <h1>{t("homeTitle")}</h1>
      </div>

      {!picking ? (
        <button className="call-btn" onClick={() => setPicking(true)}>
          <span className="big-mic"><MicIcon size={34} /></span>
          <span><strong>{t("callSomeone")}</strong><br /><span className="muted">{t("callSomeoneSub")}</span></span>
        </button>
      ) : (
        <section className="card stack">
          <h2>{t("whoToCall")}</h2>
          {canPickContact() && <button className="primary big" disabled={busy} onClick={fromContacts}>👥 {t("fromContacts")}</button>}
          {people().map((p) => (
            <button key={p.phone} className="person" disabled={busy} onClick={() => call(p)}>
              <span className="avatar">{p.name[0]?.toUpperCase()}</span>
              <span className="grow"><strong>{p.name}</strong><br /><span className="muted">{p.phone}</span></span>
              <span className="call-chip">{t("call")}</span>
            </button>
          ))}
          <form className="row" onSubmit={(e) => { e.preventDefault(); void call({ name: number, phone: number }); }}>
            <input className="grow" value={number} onChange={(e) => setNumber(e.target.value)} inputMode="tel" required
              placeholder={t("typeNumber")} aria-label={t("typeNumber")} />
            <button className="primary" disabled={busy}>{t("call")}</button>
          </form>
          <p className="muted small-text">🔒 {t("consentShort")}</p>
          <button className="linkish" onClick={() => setPicking(false)}>{t("cancel")}</button>
        </section>
      )}
      {err && <div className="error" role="alert">{err}</div>}

      <section className="stack">
        <div className="row"><h2 className="grow">{t("yourNotes")}</h2>{notes.length > 3 && <Link to="/notes">{t("seeAll")}</Link>}</div>
        {notes.length === 0 && <p className="muted">{t("noNotesYet")}</p>}
        {notes.length > 0 && <div className="list card">
          {notes.slice(0, 3).map((n) => (
            <Link key={n.id} to={`/notes/${n.id}`} className="note-row">
              <div className="grow">
                <div className="note-title">{n.title}</div>
                <div className="muted small-text">{new Date(n.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {n.participants.join(", ")}</div>
              </div>
              <span className={`status ${isFinal(n) ? "ok" : "draft"}`}>{isFinal(n) ? t("confirmed") : t("draft")}</span>
            </Link>
          ))}
        </div>}
      </section>

      <details className="more">
        <summary>{t("howItWorks")}</summary>
        <Steps />
        <button className="big" disabled={busy} onClick={() => call(null)}>{t("soloShort")}</button>
        <p className="muted small-text">{t("signedInAs")} {profile.phone} · <Link to="/privacy" className="muted">{t("privacy")}</Link></p>
      </details>
    </div>
  );
}
