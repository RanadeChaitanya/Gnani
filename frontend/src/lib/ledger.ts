// One record per person you call (distributor, supplier, customer), built from the saved notes on this phone.
// Derived on every read, so each new call is "synced" into that person's sheet without a second copy of the data.
import type { Item } from "./api";
import { isFinal, linePrice, qty, rupees, SavedNote } from "./notesDb";

export type Ledger = { name: string; notes: SavedNote[] };
export type ItemStat = { name: string; times: number; lastQty: string; rate: number | null; prevRate: number | null };
export type SmartRecord = {
  calls: number;
  confirmed: number;
  spent: number;
  lastCall: string | null;
  items: ItemStat[];
  openTasks: string[];
  toCheck: number;
};
export type WaLang = "en" | "hi" | "mr";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The other person on a call; null for a solo test note. */
export const peerOf = (n: SavedNote, me: string) => n.participants.find((p) => !same(p, me)) ?? null;

/** Notes grouped by the other person, most recent contact first. */
export function ledgers(notes: SavedNote[], me: string): Ledger[] {
  const m = new Map<string, Ledger>();
  for (const n of [...notes].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const peer = peerOf(n, me);
    if (!peer) continue;
    const key = peer.trim().toLowerCase();
    if (!m.has(key)) m.set(key, { name: peer.trim(), notes: [] });
    m.get(key)!.notes.push(n);
  }
  return [...m.values()];
}

const unitRate = (i: Item) => i.unit_price ?? (i.total_price != null && i.quantity ? Math.round((i.total_price / i.quantity) * 100) / 100 : null);

/** Facts only, computed from the notes: what was bought, how often, at what rate, and what is still open. */
export function smartRecord(l: Ledger): SmartRecord {
  const items = new Map<string, ItemStat>();
  for (const n of [...l.notes].reverse()) // oldest first, so the last write is the latest rate
    for (const i of n.note?.items ?? []) {
      const k = i.name.trim().toLowerCase();
      const s = items.get(k) ?? { name: i.name, times: 0, lastQty: "—", rate: null, prevRate: null };
      const r = unitRate(i);
      items.set(k, { name: i.name, times: s.times + 1, lastQty: qty(i), rate: r ?? s.rate, prevRate: r != null ? s.rate : s.prevRate });
    }
  const latest = l.notes[0];
  return {
    calls: l.notes.length,
    confirmed: l.notes.filter(isFinal).length,
    spent: l.notes.reduce((t, n) => t + (n.costs?.grand_total ?? 0), 0),
    lastCall: latest?.created_at ?? null,
    items: [...items.values()].sort((a, b) => b.times - a.times),
    openTasks: latest?.note?.action_items.map((a) => a.task) ?? [],
    toCheck: latest?.note?.uncertain_spans.length ?? 0,
  };
}

/** One sheet for everyone (or one person): a row per item per call. CSV with a BOM so Excel shows ₹ and Indic text. */
export function ledgerCSV(ls: Ledger[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Date", "Person", "Call", "Item", "Quantity", "Unit", "Rate (INR)", "Amount (INR)", "Confirmed by both"]];
  for (const l of ls)
    for (const n of l.notes) {
      const d = new Date(n.created_at).toLocaleDateString("en-CA");
      const items = n.note?.items ?? [];
      if (!items.length) rows.push([d, l.name, n.title, "", "", "", "", String(n.costs?.grand_total ?? ""), isFinal(n) ? "yes" : "no"]);
      for (const i of items)
        rows.push([d, l.name, n.title, i.name, String(i.quantity ?? ""), i.unit ?? "", String(unitRate(i) ?? ""), String(linePrice(i) ?? ""), isFinal(n) ? "yes" : "no"]);
    }
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

/** The language this person actually spoke on recent calls, from per-line detection. */
export function spokenLang(l: Ledger): WaLang {
  const count: Record<string, number> = {};
  for (const n of l.notes.slice(0, 5))
    for (const s of n.transcript)
      if (same(s.name, l.name) && s.lang_code) count[s.lang_code.slice(0, 2)] = (count[s.lang_code.slice(0, 2)] ?? 0) + s.text.length;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top === "hi" || top === "mr" ? top : "en";
}

const WA: Record<WaLang, { hi: (n: string) => string; order: (d: string) => string; total: string; check: string; ask: string }> = {
  en: { hi: (n) => `Namaste ${n} ji,`, order: (d) => `Order from our call on ${d}:`, total: "Total", check: "Please check", ask: "Please confirm this order." },
  hi: { hi: (n) => `नमस्ते ${n} जी,`, order: (d) => `${d} की कॉल का ऑर्डर:`, total: "कुल", check: "कृपया जाँच लें", ask: "कृपया इस ऑर्डर की पुष्टि करें।" },
  mr: { hi: (n) => `नमस्कार ${n} जी,`, order: (d) => `${d} च्या कॉलची ऑर्डर:`, total: "एकूण", check: "कृपया तपासा", ask: "कृपया या ऑर्डरची पुष्टी करा." },
};

/** A ready-to-send WhatsApp message for this person, about their latest call, in their language. */
export function waDraft(l: Ledger, me: string, lang: WaLang): string {
  const w = WA[lang], n = l.notes[0], c = n?.note;
  const d = n ? new Date(n.created_at).toLocaleDateString(lang === "en" ? "en-IN" : `${lang}-IN`, { day: "numeric", month: "short" }) : "";
  const L = [w.hi(l.name), "", w.order(d)];
  for (const i of c?.items ?? []) { const p = linePrice(i); L.push(`• ${i.name} — ${qty(i)}${p != null ? ` — ${rupees(p)}` : ""}`); }
  if (n?.costs?.grand_total != null) L.push(`*${w.total}: ${rupees(n.costs.grand_total)}*`);
  if (c?.uncertain_spans.length) L.push("", `${w.check}: ${c.uncertain_spans.map((u) => u.text).join("; ")}`);
  L.push("", w.ask, `— ${me}`);
  return L.join("\n");
}

/** WhatsApp numbers the user typed for people Saar only knows by name (e.g. someone who called them). */
const KEY = "saar:waNumbers";
export const savedNumber = (name: string): string => {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>)[name.toLowerCase()] ?? ""; } catch { return ""; }
};
export const saveNumber = (name: string, phone: string) => {
  let m: Record<string, string> = {};
  try { m = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { /* start fresh */ }
  localStorage.setItem(KEY, JSON.stringify({ ...m, [name.toLowerCase()]: phone }));
};
/** wa.me link: India +91 for 10-digit numbers, as everywhere else in Saar. */
export const waLink = (phone: string, text: string) => {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "91" + d : d}?text=${encodeURIComponent(text)}`;
};
