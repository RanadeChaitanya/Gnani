// Where a note can go, as four clear tiles. Notion: saved by the server when connected, otherwise copied
// as Markdown and Notion opened (Notion turns pasted Markdown into headings, lists and tables).
import { useEffect, useState } from "react";
import { api, ApiError, getConfig } from "../lib/api";
import { useT } from "../lib/i18n";
import { SavedNote, toMarkdown, toText, toWhatsApp } from "../lib/notesDb";
import { getProfile } from "../lib/profile";
import { ChatIcon, DownloadIcon, NotionIcon, PhoneNoteIcon } from "./icons";

export default function NoteActions({ n }: { n: SavedNote }) {
  const { t } = useT();
  const [notionApi, setNotionApi] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => void getConfig().then((c) => setNotionApi(c.notion)).catch(() => {}), []);

  const toNotesApp = async () => {
    const text = toText(n);
    if (navigator.share) await navigator.share({ title: n.title, text }).catch(() => {});
    else await navigator.clipboard.writeText(text).then(() => setMsg(t("copiedPaste")));
  };
  const toNotion = async () => {
    setMsg("");
    const md = toMarkdown(n, false);
    const dev = getProfile()?.device_token;
    if (notionApi && dev) {
      setBusy(true);
      try {
        const r = await api<{ url: string }>("/api/notion", { body: { title: n.title, markdown: md }, token: dev });
        setMsg(t("savedNotion"));
        if (r.url) window.open(r.url, "_blank", "noopener");
        return;
      } catch (e) {
        setMsg(e instanceof ApiError ? e.message : String(e));
        return;
      } finally {
        setBusy(false);
      }
    }
    await navigator.clipboard.writeText(md).catch(() => {});
    setMsg(t("notionPaste"));
    window.open("https://www.notion.so/new", "_blank", "noopener");
  };

  const tiles = [
    { icon: <PhoneNoteIcon size={26} />, label: t("tilePhoneNotes"), sub: "Samsung Notes · Keep", on: toNotesApp },
    { icon: <NotionIcon size={26} />, label: "Notion", sub: notionApi ? t("tileNotionSave") : t("tileNotionPaste"), on: toNotion },
    { icon: <ChatIcon size={26} />, label: "WhatsApp", sub: t("tileWhatsApp"),
      on: () => window.open(`https://wa.me/?text=${encodeURIComponent(toWhatsApp(n))}`, "_blank", "noopener") },
    { icon: <DownloadIcon size={26} />, label: "PDF", sub: t("tilePdf"), on: () => window.print() },
  ];
  return (
    <section className="noprint">
      <h2 className="sec">{t("saveShare")}</h2>
      <div className="tiles">
        {tiles.map((x) => (
          <button key={x.label} className="tile" disabled={busy && x.label === "Notion"} onClick={x.on}>
            <span className="tile-icon">{x.icon}</span>
            <strong>{x.label}</strong>
            <span className="muted">{x.sub}</span>
          </button>
        ))}
      </div>
      {msg && <p className="muted center small-text" role="status">{msg}</p>}
    </section>
  );
}
