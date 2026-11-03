// Where a finished note can go: the phone's notes app (Samsung Notes, Keep… via the share sheet), Notion, WhatsApp, PDF.
import { useEffect, useState } from "react";
import { api, ApiError, getConfig } from "../lib/api";
import { useT } from "../lib/i18n";
import { SavedNote, toMarkdown, toText, toWhatsApp } from "../lib/notesDb";
import { getProfile } from "../lib/profile";

export default function NoteActions({ n }: { n: SavedNote }) {
  const { t } = useT();
  const [notion, setNotion] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => void getConfig().then((c) => setNotion(c.notion)).catch(() => {}), []);

  const toNotesApp = async () => {
    const text = toText(n);
    if (navigator.share) await navigator.share({ title: n.title, text }).catch(() => {});
    else await navigator.clipboard.writeText(text).then(() => setMsg(t("copiedPaste")));
  };
  const toNotion = async () => {
    const dev = getProfile()?.device_token;
    if (!dev) return setMsg(t("setupFirst"));
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ url: string }>("/api/notion", { body: { title: n.title, markdown: toMarkdown(n, false) }, token: dev });
      setMsg(t("savedNotion"));
      if (r.url) window.open(r.url, "_blank", "noopener");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="actions noprint">
      <h2>{t("saveShare")}</h2>
      <button className="primary big" onClick={toNotesApp}>📒 {t("toNotesApp")}</button>
      {notion && <button className="big" disabled={busy} onClick={toNotion}>{busy ? "…" : `🗂 ${t("toNotion")}`}</button>}
      <div className="pill-row">
        <button className="big" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(toWhatsApp(n))}`, "_blank", "noopener")}>WhatsApp</button>
        <button className="big" onClick={() => window.print()}>PDF</button>
      </div>
      {msg && <p className="muted center" role="status">{msg}</p>}
    </section>
  );
}
