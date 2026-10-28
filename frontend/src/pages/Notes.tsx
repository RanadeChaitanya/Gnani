import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../lib/i18n";
import { deleteNote, listNotes, rupees, SavedNote } from "../lib/notesDb";

const TYPE_ICON: Record<string, string> = { order: "🛒", appointment: "🩺", complaint: "🛠️", general: "💬" };

export default function Notes() {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<SavedNote[] | null>(null);
  const refresh = () => listNotes(q).then(setNotes);
  useEffect(() => void refresh(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack">
      <h1>{t("notes")}</h1>
      <input type="search" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {notes?.length === 0 && <p className="muted">{t("noNotes")}</p>}
      <div className="list">
        {notes?.map((n) => {
          const total = n.costs?.grand_total ?? n.note?.stated_totals[0]?.amount;
          return (
            <div key={n.id} className="card row note-row">
              <Link to={`/notes/${n.id}`} className="note-card grow">
                <div className="row">
                  <span aria-hidden="true">{TYPE_ICON[n.note?.conversation_type ?? ""] ?? "📝"}</span>
                  <strong className="grow">{n.title}</strong>
                  {total != null && <strong>{rupees(total)}</strong>}
                </div>
                <div className="muted small-text">
                  {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {n.participants.join(", ")}
                  {n.note?.items.length ? ` · ${n.note.items.length} items` : ""}
                </div>
                <div className="row" style={{ marginTop: 4 }}>
                  <span className="chip">{n.kind}</span>
                  {n.status === "failed" && <span className="chip warn">failed</span>}
                  {(n.faithfulness?.flag_count ?? 0) > 0 && <span className="chip warn">⚠ {n.faithfulness!.flag_count}</span>}
                </div>
              </Link>
              <button className="small danger" aria-label={`${t("delete")} ${n.title}`}
                onClick={() => confirm(`${t("delete")}?`) && deleteNote(n.id).then(refresh)}>{t("delete")}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
