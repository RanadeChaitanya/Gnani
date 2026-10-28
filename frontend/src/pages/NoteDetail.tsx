// Note as a calm document: outcome → anything to confirm → order + total → when/where → to do.
// Everything secondary (summary, transcript, exports, delete) lives under "More".
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShareIcon } from "../components/icons";
import { useT } from "../lib/i18n";
import { byShop, deleteNote, getNote, linePrice, qty, renameNote, rupees, SavedNote, toCSV, toMarkdown, toWhatsApp, totalLine } from "../lib/notesDb";

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function NoteDetail() {
  const { id = "" } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const [n, setN] = useState<SavedNote | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  useEffect(() => void getNote(id).then((x) => setN(x ?? null)), [id]);

  if (n === undefined) return null;
  if (n === null) return <p className="muted">Note not found on this device.</p>;
  const c = n.note;
  const unmatched = (n.faithfulness?.flags ?? []).filter((f) => f.reason !== "inferred").length;
  const fileBase = n.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "saar-note";
  const share = async () => {
    const text = toWhatsApp(n);
    if (navigator.share) await navigator.share({ title: n.title, text }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const total = totalLine(n);

  return (
    <article className="doc">
      <header>
        <input aria-label="Title" className="doc-title" value={n.title}
          onChange={(e) => setN({ ...n, title: e.target.value, edited: true })} onBlur={() => renameNote(n.id, n.title)} />
        <p className="muted small-text">{new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {n.participants.join(", ")}</p>
      </header>

      {!c && <p className="muted">{n.error || "No note was generated; the transcript is kept under More."}</p>}
      {c && <p className="outcome">{c.outcome}</p>}

      {c && c.uncertain_spans.length > 0 && (
        <section className="check">
          <h2>{t("pleaseCheck")}</h2>
          <ul>{c.uncertain_spans.map((u, i) => <li key={i}>{u.text}</li>)}</ul>
        </section>
      )}

      {c && c.items.length > 0 && (
        <section>
          {byShop(c.items).map(([shop, items]) => (
            <table key={shop || "-"} className="items">
              {shop && <caption>{shop}</caption>}
              <tbody>
                {items.map((it, k) => {
                  const p = linePrice(it);
                  return (
                    <tr key={k}>
                      <td>{it.name}{it.heard_as && <div className="heard">{t("heard")} “{it.heard_as}”</div>}</td>
                      <td className="num muted">{qty(it)}</td>
                      <td className="num">{p != null ? rupees(p) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
          {total && <div className="total-row"><span>{total.split(":")[0]}</span><strong>{total.split(": ")[1]}</strong></div>}
          {c.stated_totals.map((s, i) => (
            <div key={i} className="total-row"><span>{t("saidInCall")}{s.shop ? ` · ${s.shop}` : ""}</span><strong>{rupees(s.amount)}</strong></div>
          ))}
        </section>
      )}
      {c && !c.items.length && c.stated_totals.map((s, i) => (
        <div key={i} className="total-row"><span>{t("saidInCall")}</span><strong>{rupees(s.amount)}</strong></div>
      ))}

      {c && (c.schedule.length > 0 || c.locations.length > 0) && (
        <ul className="facts">
          {c.schedule.map((s, i) => <li key={`s${i}`}>🗓 <strong>{s.when}</strong> — {s.what}{s.where ? ` · ${s.where}` : ""}</li>)}
          {c.locations.map((l, i) => (
            <li key={`l${i}`}>📍 <a href={`https://www.google.com/maps/search/${encodeURIComponent(l.name)}`} target="_blank" rel="noopener noreferrer">{l.name}</a></li>
          ))}
        </ul>
      )}

      {c && c.action_items.length > 0 && (
        <section>
          <h2>{t("actions")}</h2>
          <ul className="facts">{c.action_items.map((a, i) => <li key={i}>☐ {a.task}{a.owner ? <span className="muted"> — {a.owner}</span> : null}</li>)}</ul>
        </section>
      )}

      {unmatched > 0 && <p className="muted small-text">⚠ {unmatched} {t("unverified")}</p>}

      <button className="primary big noprint" onClick={share}><ShareIcon size={20} /> {t("shareNote")}</button>

      <details className="more noprint">
        <summary>{t("more")}</summary>
        {c && (
          <section>
            <h2>{t("summary")}</h2>
            <ul>{c.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
            {c.decisions.length > 0 && <><h2>{t("decisions")}</h2><ul>{c.decisions.map((d, i) => <li key={i}>{d.text}</li>)}</ul></>}
          </section>
        )}
        <div className="row">
          <button className="small" onClick={() => window.print()}>{t("pdf")}</button>
          <button className="small" onClick={() => navigator.clipboard.writeText(toWhatsApp(n)).then(() => setMsg(t("copied")))}>{t("copy")}</button>
          {(c?.items.length ?? 0) > 0 && <button className="small" onClick={() => download(`${fileBase}.csv`, toCSV(n), "text/csv")}>{t("csv")}</button>}
          <button className="small" onClick={() => download(`${fileBase}.md`, toMarkdown(n), "text/markdown")}>{t("exportMd")}</button>
          <button className="small danger" onClick={() => confirm(`${t("delete")}?`) && deleteNote(n.id).then(() => nav("/notes"))}>{t("delete")}</button>
        </div>
        {msg && <p className="muted" role="status">{msg}</p>}
        <h2>{t("transcript")}</h2>
        <div className="transcript">
          {n.transcript.map((l) => <p key={l.seq} dir="auto"><span className="muted">{l.name}:</span> {l.text}</p>)}
        </div>
      </details>
    </article>
  );
}
