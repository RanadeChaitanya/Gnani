import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, getConfig, Language, saveSession, Session } from "../lib/api";
import { useT } from "../lib/i18n";

export default function Setup() {
  const { t } = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mode = (params.get("mode") ?? "create") as "create" | "join" | "solo";
  const [langs, setLangs] = useState<Language[]>([]);
  const [name, setName] = useState(localStorage.getItem("saar:name") ?? "");
  const [lang, setLangCode] = useState(localStorage.getItem("saar:speak") ?? "en-IN");
  const [notesLang, setNotesLang] = useState("en");
  const [bias, setBias] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getConfig().then((c) => setLangs(c.languages)).catch((e) => setErr(e.message));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    localStorage.setItem("saar:name", name);
    localStorage.setItem("saar:speak", lang);
    const body = {
      display_name: name,
      lang_code: lang,
      notes_lang: notesLang,
      bias_words: bias.split(/[\s,]+/).filter(Boolean),
      ...(mode === "solo" ? { solo: true } : {}),
    };
    try {
      const s =
        mode === "join"
          ? await api<Session>(`/api/rooms/${code.trim().toUpperCase()}/join`, { body })
          : await api<Session>("/api/rooms", { body });
      saveSession(s);
      nav(`/room/${s.room_code}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h1>{mode === "join" ? t("join") : mode === "solo" ? t("solo") : t("start")}</h1>
      {mode === "join" && (
        <label>
          {t("code")}
          <input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={6}
            autoCapitalize="characters" className="code" style={{ fontSize: 22 }} />
        </label>
      )}
      <label>
        {t("name")}
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="nickname" />
      </label>
      <label>
        {t("speak")}
        <select value={lang} onChange={(e) => setLangCode(e.target.value)}>
          {langs.map((l) => (
            <option key={l.code} value={l.code}>{l.native} — {l.label}</option>
          ))}
        </select>
      </label>
      <label>
        {t("notesIn")}
        <select value={notesLang} onChange={(e) => setNotesLang(e.target.value)}>
          <option value="en">{t("notesEn")}</option>
          <option value="same">{t("notesSame")}</option>
          <option value="hi">{t("notesHi")}</option>
        </select>
      </label>
      <label>
        {t("bias")}
        <input value={bias} onChange={(e) => setBias(e.target.value)} placeholder="Ramesh Kirana Saar" />
        <span className="muted">{t("biasHint")}</span>
      </label>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="primary" disabled={busy}>{t("continue")}</button>
    </form>
  );
}
