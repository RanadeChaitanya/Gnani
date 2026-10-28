// One screen to start or join a call: name, language, and consent in a single "Agree" tap.
import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, getConfig, Language, Notice, Preview, saveSession, Session } from "../lib/api";
import { useT } from "../lib/i18n";
import { prepareMedia } from "../lib/media";

export default function Enter() {
  const { t, lang: uiLang } = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mode = (params.get("mode") ?? "create") as "create" | "join" | "solo";
  const [langs, setLangs] = useState<Language[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState(localStorage.getItem("saar:name") ?? "");
  const [lang, setLangCode] = useState(localStorage.getItem("saar:speak2") ?? "hi-IN");
  const [notesLang, setNotesLang] = useState("en");
  const [bias, setBias] = useState("");
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getConfig().then((c) => { setLangs(c.languages); setNotice(c.notice); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (mode !== "join" || code.length !== 6) return setPreview(null);
    api<Preview>(`/api/rooms/${code}/preview`).then(setPreview).catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [mode, code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    localStorage.setItem("saar:name", name);
    localStorage.setItem("saar:speak2", lang);
    try {
      await prepareMedia(); // inside the tap: unlock audio + ask mic permission now, not mid-call
    } catch (x) {
      setBusy(false);
      return setErr(t((x as Error).message === "insecure" ? "insecure" : "micDenied"));
    }
    const body = { display_name: name, lang_code: lang, notes_lang: notesLang, bias_words: bias.split(/[\s,]+/).filter(Boolean),
      ...(mode === "join" ? {} : { solo: mode === "solo" }) };
    try {
      const s = mode === "join"
        ? await api<Session>(`/api/rooms/${code}/join`, { body })
        : await api<Session>("/api/rooms", { body });
      saveSession(s);
      await api(`/api/rooms/${s.room_code}/consent`, { body: { action: "grant", notice_version: s.notice.version }, token: s.token });
      nav(`/room/${s.room_code}`);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {mode === "join" && preview?.host_name ? (
        <h1><span className="muted">{t("joinCallWith")}</span><br />{preview.host_name}</h1>
      ) : (
        <h1>{mode === "join" ? t("join") : mode === "solo" ? t("solo") : t("start")}</h1>
      )}
      {mode === "join" && !preview?.host_name && (
        <label>{t("code")}
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} required
            autoCapitalize="characters" className="code" placeholder="ABC234" />
        </label>
      )}
      {preview?.full && <div className="error">{t("roomFull")}</div>}

      <label>{t("name")}
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="nickname" />
      </label>
      <label>{t("speak")}
        <select value={lang} onChange={(e) => setLangCode(e.target.value)}>
          {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>
      <details className="more">
        <summary>{t("moreOptions")}</summary>
        <label>{t("notesIn")}
          <select value={notesLang} onChange={(e) => setNotesLang(e.target.value)}>
            <option value="en">{t("notesEn")}</option>
            <option value="same">{t("notesSame")}</option>
            <option value="hi">{t("notesHi")}</option>
          </select>
        </label>
        <label>{t("bias")}
          <input value={bias} onChange={(e) => setBias(e.target.value)} placeholder="Meena Sharma" />
          <span className="muted">{t("biasHint")}</span>
        </label>
      </details>

      <p className="consent-line">🔒 {t("consentShort")}{" "}
        {notice && (
          <details className="inline">
            <summary>{t("readNotice")}</summary>
            <div dir="auto" className="notice">
              {(uiLang === "hi" ? notice.text_hi : notice.text_en).split("\n").map((l, i) => <p key={i}>{l.replace(/\*\*/g, "")}</p>)}
            </div>
          </details>
        )}
      </p>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="primary big" disabled={busy || !!preview?.full}>
        {busy ? "…" : mode === "join" ? t("agreeJoin") : mode === "solo" ? t("agreeSolo") : t("agreeStart")}
      </button>
    </form>
  );
}
