// A note as compact minutes: key facts first, then short lists. Same order as the Markdown/Notion export.
import { ReactNode } from "react";
import { useT } from "../lib/i18n";
import { byShop, isFinal, linePrice, qty, rupees, SavedNote, totalLine } from "../lib/notesDb";

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="sec">{title}</h2>{children}</section>;
}

export default function NoteDoc({ n }: { n: SavedNote }) {
  const { t } = useT();
  const c = n.note;
  const roles = new Map((c?.parties ?? []).filter((p) => p.role !== "participant").map((p) => [p.name, p.role]));
  const total = totalLine(n);

  return (
    <article className="minutes">
      <header className="minutes-head">
        <div className="row">
          <span className={`status ${isFinal(n) ? "ok" : "draft"}`}>{isFinal(n) ? t("confirmedAll") : t("draft")}</span>
        </div>
        <h1 className="minutes-title">{n.title}</h1>
        <p className="muted small-text">
          {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
          {n.participants.map((p) => (roles.get(p) ? `${p} (${roles.get(p)})` : p)).join(", ")}
        </p>
      </header>
      {n.error && <p className="banner warn">{n.error}</p>}
      {!c && <p className="muted">{t("noNoteYet")}</p>}
      {c && (
        <>
          <dl className="facts-grid">
            <dt>{t("purpose")}</dt><dd>{c.purpose || "—"}</dd>
            <dt>{t("outcome")}</dt><dd><strong>{c.outcome}</strong></dd>
          </dl>
          {c.uncertain_spans.length > 0 && (
            <section className="check"><h2 className="sec">{t("pleaseCheck")}</h2><ul>{c.uncertain_spans.map((u, i) => <li key={i}>{u.text}</li>)}</ul></section>
          )}
          {c.summary.length > 0 && <Sec title={t("keyPoints")}><ul className="tight">{c.summary.map((s, i) => <li key={i}>{s}</li>)}</ul></Sec>}
          {c.items.length > 0 && (
            <Sec title={t("orderDetails")}>
              {byShop(c.items).map(([shop, items]) => (
                <table key={shop || "-"} className="items">
                  {shop && <caption>{shop}</caption>}
                  <tbody>
                    {items.map((it, i) => {
                      const p = linePrice(it);
                      return (
                        <tr key={i}>
                          <td>{it.name}{it.heard_as && <div className="heard">{t("heard")} “{it.heard_as}”</div>}</td>
                          <td className="num muted">{qty(it)}</td>
                          <td className="num">{p != null ? rupees(p) : "—"}</td>
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
            </Sec>
          )}
          {c.decisions.length > 0 && <Sec title={t("decisions")}><ul className="tight">{c.decisions.map((d, i) => <li key={i}>{d.text}</li>)}</ul></Sec>}
          {c.action_items.length > 0 && (
            <Sec title={t("actions")}>
              <ul className="todo">
                {c.action_items.map((a, i) => (
                  <li key={i}><span>☐</span><div>{a.task}{(a.owner || a.due) && <div className="muted small-text">{[a.owner, a.due].filter(Boolean).join(" · ")}</div>}</div></li>
                ))}
              </ul>
            </Sec>
          )}
          {(c.schedule.length > 0 || c.locations.length > 0) && (
            <Sec title={t("whenWhere")}>
              <ul className="todo">
                {c.schedule.map((s, i) => <li key={`s${i}`}><span>🗓</span><div><strong>{s.when}</strong> · {s.what}{s.where ? ` · ${s.where}` : ""}</div></li>)}
                {c.locations.map((l, i) => (
                  <li key={`l${i}`}><span>📍</span><div><a href={`https://www.google.com/maps/search/${encodeURIComponent(l.name)}`} target="_blank" rel="noopener noreferrer">{l.name}</a> <span className="muted">· {l.kind}</span></div></li>
                ))}
              </ul>
            </Sec>
          )}
          {(n.review?.corrections.length ?? 0) > 0 && (
            <Sec title={t("corrections")}><ul className="tight">{n.review.corrections.map((x, i) => <li key={i}><strong>{x.name}:</strong> {x.text}</li>)}</ul></Sec>
          )}
        </>
      )}
    </article>
  );
}
