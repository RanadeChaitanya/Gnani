// A note rendered as formal call minutes. Same sections, same order as the Markdown/Notion export.
import { useT } from "../lib/i18n";
import { byShop, isFinal, linePrice, qty, rupees, SavedNote, totalLine } from "../lib/notesDb";

export default function NoteDoc({ n }: { n: SavedNote }) {
  const { t } = useT();
  const c = n.note;
  const roles = new Map((c?.parties ?? []).map((p) => [p.name, p.role]));
  const total = totalLine(n);
  let k = 0;
  const H = ({ children }: { children: string }) => <h2 className="sec">{++k}. {children}</h2>;

  return (
    <article className="minutes">
      <header className="minutes-head">
        <div className={`status ${isFinal(n) ? "ok" : "draft"}`}>{isFinal(n) ? t("confirmedAll") : t("draft")}</div>
        <h1 className="minutes-title">{n.title}</h1>
        <dl>
          <dt>{t("date")}</dt><dd>{new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}</dd>
          <dt>{t("participants")}</dt><dd>{n.participants.map((p) => (roles.get(p) ? `${p} (${roles.get(p)})` : p)).join(", ")}</dd>
        </dl>
      </header>
      {n.error && <p className="banner warn">{n.error}</p>}
      {!c && <p className="muted">{t("noNoteYet")}</p>}
      {c && (
        <>
          <section><H>{t("purpose")}</H><p>{c.purpose || c.outcome}</p></section>
          <section><H>{t("outcome")}</H><p className="outcome">{c.outcome}</p></section>
          <section><H>{t("summary")}</H><p>{c.summary.join(" ")}</p></section>
          {c.items.length > 0 && (
            <section>
              <H>{t("orderDetails")}</H>
              {byShop(c.items).map(([shop, items]) => (
                <table key={shop || "-"} className="items">
                  {shop && <caption>{shop}</caption>}
                  <thead><tr><th>{t("item")}</th><th className="num">{t("qty")}</th><th className="num">{t("amount")}</th></tr></thead>
                  <tbody>
                    {items.map((it, i) => {
                      const p = linePrice(it);
                      return (
                        <tr key={i}>
                          <td>{it.name}{it.heard_as && <div className="heard">{t("heard")} “{it.heard_as}”</div>}</td>
                          <td className="num">{qty(it)}</td>
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
            </section>
          )}
          {c.decisions.length > 0 && <section><H>{t("decisions")}</H><ul>{c.decisions.map((d, i) => <li key={i}>{d.text}</li>)}</ul></section>}
          {c.action_items.length > 0 && (
            <section>
              <H>{t("actions")}</H>
              <table className="items">
                <thead><tr><th>{t("task")}</th><th>{t("owner")}</th><th>{t("due")}</th></tr></thead>
                <tbody>{c.action_items.map((a, i) => <tr key={i}><td>{a.task}</td><td>{a.owner ?? "—"}</td><td>{a.due ?? "—"}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          {(c.schedule.length > 0 || c.locations.length > 0) && (
            <section>
              <H>{t("whenWhere")}</H>
              <ul>
                {c.schedule.map((s, i) => <li key={`s${i}`}><strong>{s.when}</strong> — {s.what}{s.where ? `, ${s.where}` : ""}</li>)}
                {c.locations.map((l, i) => (
                  <li key={`l${i}`}><a href={`https://www.google.com/maps/search/${encodeURIComponent(l.name)}`} target="_blank" rel="noopener noreferrer">{l.name}</a> <span className="muted">({l.kind})</span></li>
                ))}
              </ul>
            </section>
          )}
          {c.uncertain_spans.length > 0 && (
            <section className="check"><H>{t("pleaseCheck")}</H><ul>{c.uncertain_spans.map((u, i) => <li key={i}>{u.text}</li>)}</ul></section>
          )}
          {(n.review?.corrections.length ?? 0) > 0 && (
            <section><H>{t("corrections")}</H><ul>{n.review.corrections.map((x, i) => <li key={i}><strong>{x.name}:</strong> {x.text}</li>)}</ul></section>
          )}
        </>
      )}
    </article>
  );
}
