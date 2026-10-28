import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../lib/i18n";
import { listNotes, rupees, SavedNote } from "../lib/notesDb";

export default function Notes() {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<SavedNote[] | null>(null);
  useEffect(() => void listNotes(q).then(setNotes), [q]);

  return (
    <div className="stack">
      <h1>{t("notes")}</h1>
      {(notes?.length ?? 0) > 3 && <input type="search" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />}
      {notes?.length === 0 && <p className="muted">{t("noNotes")}</p>}
      <div className="list">
        {notes?.map((n) => {
          const total = n.costs?.unpriced_items ? n.note?.stated_totals[0]?.amount : n.costs?.grand_total ?? n.note?.stated_totals[0]?.amount;
          return (
            <Link key={n.id} to={`/notes/${n.id}`} className="note-row">
              <div className="grow">
                <div className="note-title">{n.title}</div>
                <div className="muted small-text">
                  {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  {n.kind === "quick" ? " · quick" : ""}
                  {(n.note?.uncertain_spans.length ?? 0) > 0 ? ` · ${n.note!.uncertain_spans.length} to check` : ""}
                </div>
              </div>
              {total != null && <strong>{rupees(total)}</strong>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
