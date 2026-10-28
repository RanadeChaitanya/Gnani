import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalIcon, CartIcon, DownloadIcon, PinIcon, ShareIcon } from "../components/icons";
import { useT } from "../lib/i18n";
import { byShop, deleteNote, getNote, linePrice, qty, renameNote, rupees, SavedNote, toCSV, toMarkdown, toWhatsApp } from "../lib/notesDb";

const TYPE_ICON = { order: "🛒", appointment: "🩺", complaint: "🛠️", general: "💬" } as const;

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
  const [tab, setTab] = useState<"note" | "transcript">("note");
  const [hl, setHl] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => void getNote(id).then((x) => setN(x ?? null)), [id]);

  if (n === undefined) return null;
  if (n === null) return <p className="muted">Note not found on this device.</p>;
  const c = n.note;
  const flags = n.faithfulness?.flags ?? [];
  const fileBase = n.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "saar-note";

  const show = (seq: number) => {
    setTab("transcript");
    setHl(seq);
    setTimeout(() => document.getElementById(`t-${seq}`)?.scrollIntoView({ block: "center" }), 0);
  };
  const Ev = ({ e }: { e: number[] }) => (
    <span className="ev">{e.map((s) => <button key={s} className="evchip" onClick={() => show(s)} aria-label={`Show line ${s} of the transcript`}>#{s}</button>)}</span>
  );
  const Warn = ({ prefix }: { prefix: string }) => {
    const f = flags.filter((x) => x.field === prefix || x.field.startsWith(prefix + ".") || x.field.startsWith(prefix + "["));
    return f.length ? <span className="chip warn" title={f.map((x) => `${x.value}: ${x.reason}`).join("; ")}>⚠ {f.map((x) => String(x.value)).join(", ")}</span> : null;
  };
  const share = async () => {
    const text = toWhatsApp(n);
    if (navigator.share) await navigator.share({ title: n.title, text }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <article className="doc">
      <header className="doc-head">
        <div className="doc-type">{c ? TYPE_ICON[c.conversation_type] : "📝"} {c?.conversation_type ?? n.kind}</div>
        <input aria-label="Title" className="doc-title" value={n.title}
          onChange={(e) => setN({ ...n, title: e.target.value, edited: true })} onBlur={() => renameNote(n.id, n.title)} />
        <p className="muted">{new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {n.participants.join(", ")}</p>
      </header>
      {n.error && <div className="banner">{n.error}</div>}
      {flags.length > 0 && <div className="banner warn" role="note">⚠ {flags.length} {t("unverified")}</div>}

      <div className="actions noprint">
        <button className="primary" onClick={share}><ShareIcon size={18} /> {t("whatsapp")}</button>
        <button onClick={() => window.print()}><DownloadIcon size={18} /> {t("pdf")}</button>
        <button onClick={() => navigator.clipboard.writeText(toWhatsApp(n)).then(() => setMsg(t("copied")))}>{t("copy")}</button>
        {(c?.items.length ?? 0) > 0 && <button onClick={() => download(`${fileBase}.csv`, toCSV(n), "text/csv")}>{t("csv")}</button>}
        <button onClick={() => download(`${fileBase}.md`, toMarkdown(n), "text/markdown")}>{t("exportMd")}</button>
      </div>
      {msg && <p className="muted" role="status">{msg}</p>}

      <div className="tabs noprint" role="tablist">
        <button role="tab" aria-selected={tab === "note"} onClick={() => setTab("note")}>{t("note")}</button>
        <button role="tab" aria-selected={tab === "transcript"} onClick={() => setTab("transcript")}>{t("transcript")}</button>
      </div>

      {tab === "note" && c && (
        <div className="stack">
          <section className="sec">
            <h2>{t("summary")}</h2>
            <ul>{c.summary.map((s, i) => <li key={i}>{s} <Warn prefix={`summary[${i}]`} /></li>)}</ul>
            {c.parties.length > 0 && <p className="muted">{t("people")}: {c.parties.map((p) => `${p.name} (${p.role})`).join(", ")}</p>}
          </section>

          {c.requirements.length > 0 && (
            <section className="sec"><h2>{t("requirements")}</h2>
              <ul>{c.requirements.map((r, i) => (
                <li key={i}>{r.text}{r.original && <div className="quote" dir="auto">“{r.original}”</div>} <Ev e={r.evidence} /> <Warn prefix={`requirements[${i}]`} /></li>
              ))}</ul>
            </section>
          )}

          {(c.items.length > 0 || c.stated_totals.length > 0) && (
            <section className="sec card order">
              <h2><CartIcon size={20} /> {t("order")}</h2>
              {byShop(c.items).map(([shop, items]) => {
                const sub = n.costs?.by_shop.find((s) => (s.shop ?? "") === shop);
                return (
                  <table key={shop || "-"}>
                    {shop && <caption>{shop}</caption>}
                    <thead><tr><th>{t("item")}</th><th>{t("qty")}</th><th className="num">{t("price")}</th></tr></thead>
                    <tbody>
                      {items.map((it) => {
                        const k = c.items.indexOf(it);
                        const p = linePrice(it);
                        return (
                          <tr key={k}>
                            <td>{it.name} <Ev e={it.evidence} /> <Warn prefix={`items[${k}]`} /></td>
                            <td>{qty(it)}</td>
                            <td className="num">{p != null ? rupees(p) : <span className="muted">{t("unpriced")}</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {sub && sub.priced > 0 && byShop(c.items).length > 1 && (
                      <tfoot><tr><td colSpan={2}>{t("subtotal")}</td><td className="num">{rupees(sub.subtotal)}</td></tr></tfoot>
                    )}
                  </table>
                );
              })}
              {n.costs?.grand_total != null && (
                <div className="total-row"><span>{n.costs.unpriced_items ? `${t("pricedItems")} (+${n.costs.unpriced_items} ${t("unpriced")})` : t("total")}</span><strong>{rupees(n.costs.grand_total)}</strong></div>
              )}
              {c.stated_totals.map((s, i) => (
                <div key={i} className="total-row said"><span>{t("saidInCall")}{s.shop ? ` · ${s.shop}` : ""} <Ev e={s.evidence} /></span><strong>{rupees(s.amount)} <Warn prefix={`stated_totals[${i}]`} /></strong></div>
              ))}
            </section>
          )}

          {c.locations.length > 0 && (
            <section className="sec"><h2><PinIcon size={20} /> {t("locations")}</h2>
              <ul className="plain">{c.locations.map((l, i) => (
                <li key={i}><a href={`https://www.google.com/maps/search/${encodeURIComponent(l.name)}`} target="_blank" rel="noopener noreferrer">{l.name}</a>
                  <span className="chip">{l.kind}</span> <Ev e={l.evidence} /> <Warn prefix={`locations[${i}]`} /></li>
              ))}</ul>
            </section>
          )}

          {c.schedule.length > 0 && (
            <section className="sec"><h2><CalIcon size={20} /> {t("schedule")}</h2>
              <ul className="plain">{c.schedule.map((s, i) => (
                <li key={i}><strong>{s.when}</strong> — {s.what}{s.where ? ` · ${s.where}` : ""} <Ev e={s.evidence} /> <Warn prefix={`schedule[${i}]`} /></li>
              ))}</ul>
            </section>
          )}

          {c.decisions.length > 0 && (
            <section className="sec"><h2>{t("decisions")}</h2><ul>{c.decisions.map((d, i) => <li key={i}>{d.text} <Ev e={d.evidence} /> <Warn prefix={`decisions[${i}]`} /></li>)}</ul></section>
          )}
          {c.action_items.length > 0 && (
            <section className="sec"><h2>{t("actions")}</h2>
              <ul className="plain">{c.action_items.map((a, i) => (
                <li key={i}>☐ {a.task}{a.owner && <span className="muted"> — {a.owner}</span>}{a.due && <span className="muted"> · {a.due}</span>} <Ev e={a.evidence} /> <Warn prefix={`action_items[${i}]`} /></li>
              ))}</ul>
            </section>
          )}
          {c.open_questions.length > 0 && <section className="sec"><h2>{t("openQuestions")}</h2><ul>{c.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></section>}
          {c.uncertain_spans.length > 0 && (
            <details className="sec"><summary>{t("uncertain")} ({c.uncertain_spans.length})</summary>
              <ul>{c.uncertain_spans.map((u, i) => <li key={i}>“{u.text}” — <em>{u.reason}</em> <Ev e={u.evidence} /></li>)}</ul>
            </details>
          )}
        </div>
      )}
      {tab === "note" && !c && <p className="muted">No note was generated; the transcript is kept.</p>}
      {(tab === "transcript") && (
        <div className="stack">
          {n.transcript.map((l) => (
            <div key={l.seq} id={`t-${l.seq}`} className={`tline ${hl === l.seq ? "hl" : ""}`} dir="auto">
              <span className="muted">#{l.seq} {l.name}:</span> {l.text}
            </div>
          ))}
        </div>
      )}
      <div className="print-only">
        <h2>{t("transcript")}</h2>
        {n.transcript.map((l) => <p key={l.seq}>#{l.seq} {l.name}: {l.text}</p>)}
      </div>
      <button className="danger noprint" onClick={() => confirm(`${t("delete")}?`) && deleteNote(n.id).then(() => nav("/notes"))}>{t("delete")}</button>
    </article>
  );
}
