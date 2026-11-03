import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MicIcon, NoteIcon } from "../components/icons";
import Wave from "../components/Wave";
import { useT } from "../lib/i18n";
import { listNotes, SavedNote } from "../lib/notesDb";

export default function Home() {
  const { t } = useT();
  const [notes, setNotes] = useState<SavedNote[]>([]);
  useEffect(() => void listNotes().then(setNotes), []);
  const h = new Date().getHours();
  const toCheck = notes.reduce((n, x) => n + (x.note?.uncertain_spans.length ?? 0), 0);

  return (
    <div className="stack home">
      <div className="greet">
        <div className="muted">{t(h < 12 ? "morning" : h < 17 ? "afternoon" : "evening")}</div>
        <h1>{t("tagline")}</h1>
      </div>
      <div className="mic-stage">
        <div className="mic-row">
          <Wave bars={9} />
          <Link className="big-mic" to="/setup?mode=create" aria-label={t("start")}><MicIcon size={36} /></Link>
          <Wave bars={9} />
        </div>
        <strong>{t("tapToStart")}</strong>
      </div>
      <div className="pill-row">
        <Link className="btn" to="/setup?mode=join">{t("join")}</Link>
        <Link className="btn" to="/setup?mode=solo">{t("soloShort")}</Link>
      </div>
      <section className="card stack">
        <h2><NoteIcon size={18} /> {t("notes")}</h2>
        <div className="stats">
          <Link to="/notes" className="stat"><b>{notes.length}</b><span>{t("notes")}</span></Link>
          <Link to="/notes" className="stat"><b>{toCheck}</b><span>{t("toCheck")}</span></Link>
          <Link to={notes[0] ? `/notes/${notes[0].id}` : "/notes"} className="stat"><b>{notes[0] ? "→" : "–"}</b><span>{t("latest")}</span></Link>
        </div>
      </section>
      <p className="muted small-text center">{t("demo")} · <Link to="/privacy" className="muted">{t("privacy")}</Link></p>
    </div>
  );
}
