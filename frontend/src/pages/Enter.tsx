// One screen to start or join a call: name, language, topic, and consent in a single "Agree" tap.
import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, getConfig, Language, Notice, Preview, saveSession, Scenario, Session } from "../lib/api";
import { useT } from "../lib/i18n";
import { prepareMedia } from "../lib/media";

const SCENARIOS: { id: Scenario; icon: string; key: "scShop" | "scAppt" | "scComplaint" | "scOther" }[] = [
  { id: "shop", icon: "🛒", key: "scShop" },
  { id: "appointment", icon: "🩺", key: "scAppt" },
  { id: "complaint", icon: "🛠️", key: "scComplaint" },
  { id: "general", icon: "💬", key: "scOther" },
];

function NoticeText({ text }: { text: string }) {
  return <>{text.split("\n").map((l, i) => <p key={i}>{l.replace(/\*\*/g, "")}</p>)}</>;
}

export default function Enter() {
  const { t, lang: uiLang } = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mode = (params.get("mode") ?? "create") as "create" | "join" | "solo";
  const [langs, setLangs] = useState<Language[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState(localStorage.getItem("saar:name") ?? "");
  const [lang, setLangCode] = useState(localStorage.getItem("saar:speak") ?? "en-IN");
  const [scenario, setScenario] = useState<Scenario>((localStorage.getItem("saar:scenario") as Scenario) || "shop");
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
    localStorage.setItem("saar:speak", lang);
    if (mode !== "join") localStorage.setItem("saar:scenario", scenario);
    try {
      await prepareMedia(); // inside the tap: unlock audio + ask mic permission now, not mid-call
    } catch (x) {
      setBusy(false);
      return setErr(t((x as Error).message === "insecure" ? "insecure" : "micDenied"));
    }
    const body = { display_name: name, lang_code: lang, notes_lang: notesLang, bias_words: bias.split(/[\s,]+/).filter(Boolean),
      ...(mode === "join" ? {} : { scenario, solo: mode === "solo" }) };
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

  const sc = SCENARIOS.find((s) => s.id === preview?.scenario);
  return (
    <form className="stack" onSubmit={submit}>
      {mode === "join" ? (
        <>
          <h1>{t("join")}</h1>
          {preview?.host_name ? (
            <div className="card invite">
              <div className="avatar">{preview.host_name[0]?.toUpperCase()}</div>
              <div><strong>{preview.host_name}</strong> {t("invitedYou")}{sc && <div className="muted">{sc.icon} {t(sc.key)}</div>}</div>
            </div>
          ) : (
            <label>{t("code")}
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} required
                autoCapitalize="characters" className="code" inputMode="text" placeholder="ABC234" />
            </label>
          )}
          {preview?.full && <div className="error">{t("roomFull")}</div>}
        </>
      ) : (
        <h1>{mode === "solo" ? t("solo") : t("start")}</h1>
      )}

      <label>{t("name")}
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="nickname" />
      </label>
      <label>{t("speak")}
        <select value={lang} onChange={(e) => setLangCode(e.target.value)}>
          {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>
      {mode !== "join" && (
        <fieldset className="chips">
          <legend>{t("topic")}</legend>
          {SCENARIOS.map((s) => (
            <button type="button" key={s.id} className={`chip-btn ${scenario === s.id ? "on" : ""}`}
              aria-pressed={scenario === s.id} onClick={() => setScenario(s.id)}>{s.icon} {t(s.key)}</button>
          ))}
        </fieldset>
      )}
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
          <input value={bias} onChange={(e) => setBias(e.target.value)} placeholder="Meena Sharma Kirana" />
          <span className="muted">{t("biasHint")}</span>
        </label>
      </details>

      <section className="card consent" aria-labelledby="consent-h">
        <h2 id="consent-h">🔒 {t("consentTitle")}</h2>
        <ul>
          <li>{t("c1")}</li>
          <li>{t("c2")}</li>
          <li>{t("c3")}</li>
          <li>{t("c4")}</li>
        </ul>
        {notice && (
          <details>
            <summary>{t("readNotice")}</summary>
            <div dir="auto" className="notice"><NoticeText text={uiLang === "hi" ? notice.text_hi : notice.text_en} /></div>
          </details>
        )}
      </section>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="primary big" disabled={busy || !!preview?.full}>
        {busy ? "…" : mode === "join" ? t("agreeJoin") : mode === "solo" ? t("agreeSolo") : t("agreeStart")}
      </button>
      <p className="muted center">{mode === "join" ? t("agreeJoinHint") : t("agreeStartHint")}</p>
    </form>
  );
}
