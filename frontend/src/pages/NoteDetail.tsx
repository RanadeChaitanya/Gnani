// A saved note: the minutes, then where to send them. Transcript and delete stay out of the way.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import NoteActions from "../components/NoteActions";
import NoteDoc from "../components/NoteDoc";
import { useT } from "../lib/i18n";
import { deleteNote, getNote, SavedNote, toMarkdown } from "../lib/notesDb";

export default function NoteDetail() {
  const { id = "" } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const [n, setN] = useState<SavedNote | null | undefined>(undefined);
  useEffect(() => void getNote(id).then((x) => setN(x ?? null)), [id]);

  if (n === undefined) return null;
  if (n === null) return <p className="muted">{t("noteMissing")}</p>;
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toMarkdown(n)], { type: "text/markdown" }));
    a.download = `${n.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "saar-note"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      <Link to="/" className="back noprint">← {t("home")}</Link>
      <NoteDoc n={n} />
      <NoteActions n={n} />
      <details className="more noprint">
        <summary>{t("transcriptMore")}</summary>
        <div className="transcript">
          {n.transcript.map((l) => <p key={l.seq} dir="auto"><span className="muted">{l.name}:</span> {l.text}</p>)}
        </div>
        <div className="pill-row">
          <button onClick={download}>{t("exportMd")}</button>
          <button className="danger" onClick={() => confirm(`${t("delete")}?`) && deleteNote(n.id).then(() => nav("/"))}>{t("delete")}</button>
        </div>
      </details>
    </div>
  );
}
