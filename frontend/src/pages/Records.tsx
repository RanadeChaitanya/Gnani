// Records: one sheet per person you call, rebuilt from the notes on this phone, plus a WhatsApp draft in their language.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useT } from "../lib/i18n";
import { Ledger, ledgerCSV, ledgers, saveNumber, savedNumber, smartRecord, spokenLang, WaLang, waDraft, waLink } from "../lib/ledger";
import { isFinal, listNotes, rupees } from "../lib/notesDb";
import { getProfile, people } from "../lib/profile";

function useLedgers(): Ledger[] | null {
  const [ls, setLs] = useState<Ledger[] | null>(null);
  useEffect(() => void listNotes().then((n) => setLs(ledgers(n, getProfile()?.name ?? ""))), []);
  return ls;
}

function downloadCSV(ls: Ledger[], name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ledgerCSV(ls)], { type: "text/csv;charset=utf-8" }));
  a.download = `saar-${name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");

export function RecordList() {
  const { t } = useT();
  const ls = useLedgers();
  if (!ls) return null;
  return (
    <div className="stack">
      <Link to="/" className="back">← {t("home")}</Link>
      <h1>{t("records")}</h1>
      {ls.length === 0 && <p className="muted">{t("recordsEmpty")}</p>}
      <div className="list">
        {ls.map((l) => {
          const r = smartRecord(l);
          return (
            <Link key={l.name} to={`/records/${encodeURIComponent(l.name)}`} className="note-row">
              <div className="grow">
                <div className="note-title">{l.name}</div>
                <div className="muted small-text">{r.calls} {t("calls")} · {t("lastCall")} {day(r.lastCall)}</div>
              </div>
              {r.spent > 0 && <strong>{rupees(r.spent)}</strong>}
            </Link>
          );
        })}
      </div>
      {ls.length > 0 && <button className="primary giant" onClick={() => downloadCSV(ls, "all")}>{t("excelAll")}</button>}
    </div>
  );
}

export function RecordDetail() {
  const { name = "" } = useParams();
  const { t } = useT();
  const ls = useLedgers();
  const l = ls?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const me = getProfile()?.name ?? "";
  const r = useMemo(() => (l ? smartRecord(l) : null), [l]);
  const [lang, setLang] = useState<WaLang | null>(null);
  const [msg, setMsg] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!l) return;
    const lg = spokenLang(l);
    setLang(lg);
    setMsg(waDraft(l, me, lg));
    setPhone(savedNumber(l.name) || people().find((p) => p.name.toLowerCase() === l.name.toLowerCase())?.phone || "");
  }, [l, me]);

  if (!ls) return null;
  if (!l || !r) return <p className="muted">{t("noteMissing")}</p>;
  const digits = phone.replace(/\D/g, "");

  return (
    <div className="stack">
      <Link to="/records" className="back">← {t("records")}</Link>
      <h1>{l.name}</h1>
      <dl className="facts-grid">
        <dt>{t("calls")}</dt><dd>{r.calls} · {r.confirmed} {t("confirmed").toLowerCase()}</dd>
        <dt>{t("spent")}</dt><dd><strong>{rupees(r.spent)}</strong></dd>
        <dt>{t("lastCall")}</dt><dd>{day(r.lastCall)}</dd>
        {r.toCheck > 0 && <><dt>{t("pleaseCheck")}</dt><dd>{r.toCheck}</dd></>}
      </dl>

      {r.items.length > 0 && (
        <section>
          <h2 className="sec">{t("itemsBought")}</h2>
          <table className="items">
            <thead><tr><th>{t("item")}</th><th>{t("lastQty")}</th><th className="num">{t("rate")}</th></tr></thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.name}>
                  <td>{i.name} <span className="muted small-text">×{i.times}</span></td>
                  <td className="muted">{i.lastQty}</td>
                  <td className="num">
                    {i.rate != null ? rupees(i.rate) : "—"}
                    {i.rate != null && i.prevRate != null && i.rate !== i.prevRate && (
                      <span className={i.rate > i.prevRate ? "up" : "down"} title={`${t("was")} ${rupees(i.prevRate)}`}> {i.rate > i.prevRate ? "▲" : "▼"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {r.openTasks.length > 0 && (
        <section><h2 className="sec">{t("openTasks")}</h2><ul className="tight">{r.openTasks.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
      )}

      <section>
        <h2 className="sec">{t("calls")}</h2>
        <div className="list">
          {l.notes.map((n) => (
            <Link key={n.id} to={`/notes/${n.id}`} className="note-row">
              <div className="grow"><div className="note-title">{n.title}</div><div className="muted small-text">{day(n.created_at)}</div></div>
              <span className={`status ${isFinal(n) ? "ok" : "draft"}`}>{isFinal(n) ? t("confirmed") : t("draft")}</span>
            </Link>
          ))}
        </div>
      </section>

      <button className="giant" onClick={() => downloadCSV([l], l.name)}>{t("excelOne")}</button>

      <section className="stack">
        <h2 className="sec">{t("waDraft")}</h2>
        <label>{t("msgLang")}
          <select value={lang ?? "en"} onChange={(e) => { const v = e.target.value as WaLang; setLang(v); setMsg(waDraft(l, me, v)); }}>
            <option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option>
          </select>
        </label>
        <textarea dir="auto" rows={9} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label={t("waDraft")} />
        <label>{t("waNumber")}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => saveNumber(l.name, phone)} inputMode="tel" placeholder="98765 43210" />
        </label>
        <a className={`btn primary giant${digits.length < 10 ? " disabled" : ""}`} aria-disabled={digits.length < 10}
          href={digits.length >= 10 ? waLink(phone, msg) : undefined} target="_blank" rel="noopener noreferrer"
          onClick={() => saveNumber(l.name, phone)}>{t("sendWa")}</a>
      </section>
    </div>
  );
}
