// Opened from an invite link or an incoming call: one tap to accept (which is also the consent).
import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, Preview, saveSession, Session } from "../lib/api";
import { Key, useT } from "../lib/i18n";
import { prepareMedia } from "../lib/media";
import { getProfile } from "../lib/profile";
import { useLanguages } from "./Home";

export async function acceptCall(code: string, name: string, lang: string): Promise<Session> {
  await prepareMedia(); // inside the tap: unlocks audio and asks for the mic now, not mid-call
  const s = await api<Session>(`/api/rooms/${code}/join`, { body: { display_name: name, lang_code: lang } });
  saveSession(s);
  await api(`/api/rooms/${code}/consent`, { body: { action: "grant", notice_version: s.notice.version }, token: s.token });
  return s;
}

export const errText = (x: unknown, t: (k: Key) => string) =>
  x instanceof ApiError ? x.message : t((x as Error).message === "insecure" ? "insecure" : "micDenied");

export default function Join() {
  const { code = "" } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const langs = useLanguages();
  const profile = getProfile();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState(profile?.name ?? "");
  const [lang, setLang] = useState(profile?.lang ?? "auto");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Preview>(`/api/rooms/${code.toUpperCase()}/preview`).then(setPreview).catch((e) => setErr(e.message));
  }, [code]);

  async function accept(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const s = await acceptCall(code.toUpperCase(), name, lang);
      nav(`/room/${s.room_code}`, { replace: true });
    } catch (x) {
      setErr(errText(x, t));
    } finally {
      setBusy(false);
    }
  }
  const over = preview && (preview.full || preview.status === "ended");

  return (
    <form className="ring-screen" onSubmit={accept}>
      <div className="avatar xl">{preview?.host_name?.[0]?.toUpperCase() ?? "…"}</div>
      <p className="muted">{t("invitedBy")}</p>
      <h1>{preview?.host_name ?? "…"}</h1>
      {over && <div className="error">{preview!.full ? t("roomFull") : t("callOver")}</div>}
      {!profile && (
        <div className="stack card">
          <label>{t("name")}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="name" /></label>
          <details className="more">
            <summary>{t("autoLang")}</summary>
            <label>{t("language")}
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>
          </details>
        </div>
      )}
      <p className="muted small-text center">🔒 {t("consentShort")}</p>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="primary big accept" disabled={busy || !!over}>{busy ? "…" : t("acceptJoin")}</button>
      <button type="button" className="big" onClick={() => nav("/")}>{t("notNow")}</button>
    </form>
  );
}
