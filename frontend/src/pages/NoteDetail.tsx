import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useT } from "../lib/i18n";
import { deleteNote, getNote, renameNote, SavedNote, toMarkdown } from "../lib/notesDb";

export default function NoteDetail() {
  const { id = "" } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const [n, setN] = useState<SavedNote | null | undefined>(undefined);
  const [tab, setTab] = useState<"note" | "transcript">("note");
  const [hl, setHl] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => void getNote(id).then((x) => setN(x ?? null)), [id]);

  if (n === undefined) return null;
  if (n === null) return <p className="muted">Note not found on this device.</p>;
  const c = n.note;
  const flags = n.faithfulness?.flags ?? [];
  const flagged = (field: string) => flags.filter((f) => f.field === field || f.field.startsWith(field + "."));

  const show = (seq: number) => {
    setTab("transcript");
    setHl(seq);
    setTimeout(() => document.getElementById(`t-${seq}`)?.scrollIntoView({ block: "center" }), 0);
  };
  const Ev = ({ e }: { e: number[] }) => (
    <>{e.map((s) => <button key={s} className="chip" onClick={() => show(s)} aria-label={`Show transcript line ${s}`}>#{s}</button>)}</>
  );
  const Warn = ({ field }: { field: string }) => {
    const f = flagged(field);
    return f.length ? <span className="chip warn" title={f.map((x) => `${x.value}: ${x.reason}`).join("; ")}>⚠ {f.map((x) => String(x.value)).join(", ")}</span> : null;
  };

  const md = toMarkdown(n);
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${n.title.replace(/[^\p{L}\p{N}]+/gu, "-")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <input aria-label="Title" value={n.title} style={{ fontSize: 20, fontWeight: 700 }}
        onChange={(e) => setN({ ...n, title: e.target.value, edited: true })} onBlur={() => renameNote(n.id, n.title)} />
      <p className="muted">{new Date(n.created_at).toLocaleString()} · {n.participants.join(", ")} · {n.langs.join(", ")} · {n.kind}</p>
      {n.error && <div className="banner">{n.error}</div>}
      {flags.length > 0 && <div className="banner" role="note">⚠ {flags.length} {t("unverified")}</div>}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "note"} onClick={() => setTab("note")}>{t("note")}</button>
        <button role="tab" aria-selected={tab === "transcript"} onClick={() => setTab("transcript")}>{t("transcript")}</button>
      </div>
      {tab === "note" && c && (
        <div className="stack">
          <section><h2>Summary</h2><ul>{c.summary.map((s, i) => <li key={i}>{s} <Warn field={`summary[${i}]`} /></li>)}</ul></section>
          {c.key_points.length > 0 && <section><h2>Key points</h2><ul>{c.key_points.map((k, i) => <li key={i}>{k.text} <Ev e={k.evidence} /> <Warn field={`key_points[${i}]`} /></li>)}</ul></section>}
          {c.decisions.length > 0 && <section><h2>Decisions</h2><ul>{c.decisions.map((k, i) => <li key={i}>{k.text} <Ev e={k.evidence} /> <Warn field={`decisions[${i}]`} /></li>)}</ul></section>}
          {c.action_items.length > 0 && (
            <section><h2>Action items</h2>
              <table><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th></th></tr></thead>
                <tbody>{c.action_items.map((a, i) => (
                  <tr key={i}><td>{a.task} <Warn field={`action_items[${i}]`} /></td><td>{a.owner ?? "—"}</td><td>{a.due ?? "—"}</td><td><Ev e={a.evidence} /></td></tr>
                ))}</tbody></table>
            </section>
          )}
          {Object.entries(c.entities).some(([, v]) => v.length) && (
            <section><h2>Entities</h2><ul>{Object.entries(c.entities).filter(([, v]) => v.length).map(([k, v]) => (
              <li key={k}>{k}: {v.map((x, i) => <span key={i}>{i > 0 && ", "}{x} <Warn field={`entities.${k}[${i}]`} /></span>)}</li>
            ))}</ul></section>
          )}
          {c.open_questions.length > 0 && <section><h2>Open questions</h2><ul>{c.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></section>}
          {c.uncertain_spans.length > 0 && <section><h2>Uncertain</h2><ul>{c.uncertain_spans.map((u, i) => <li key={i}>{u.text} — <em>{u.reason}</em> <Ev e={u.evidence} /></li>)}</ul></section>}
        </div>
      )}
      {tab === "note" && !c && <p className="muted">No note was generated; the transcript is kept.</p>}
      {tab === "transcript" && (
        <div className="stack">
          {n.transcript.map((l) => (
            <div key={l.seq} id={`t-${l.seq}`} className={`tline ${hl === l.seq ? "hl" : ""}`} dir="auto">
              <span className="muted">#{l.seq} {l.name}:</span> {l.text}
            </div>
          ))}
        </div>
      )}
      <div className="row">
        <button onClick={() => navigator.clipboard.writeText(md).then(() => setMsg(t("copied")))}>{t("copy")}</button>
        <button onClick={download}>{t("exportMd")}</button>
        {"share" in navigator && <button onClick={() => navigator.share({ title: n.title, text: md }).catch(() => {})}>{t("shareNote")}</button>}
        <button className="danger" onClick={() => confirm(`${t("delete")}?`) && deleteNote(n.id).then(() => nav("/notes"))}>{t("delete")}</button>
      </div>
      {msg && <p className="muted" role="status">{msg}</p>}
    </>
  );
}
