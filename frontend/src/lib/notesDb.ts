// Local-first notes in IndexedDB (spec §11.3) + formatted exports (Markdown, WhatsApp text, CSV).
import { clear, del, get, set, values } from "idb-keyval";
import type { Item, NotePayload } from "./api";

export type SavedNote = NotePayload & { title: string; edited: boolean; saved_at: string };

export async function saveNote(p: NotePayload): Promise<SavedNote> {
  const prev = await get<SavedNote>(p.id);
  const n: SavedNote = {
    ...p,
    title: prev?.edited ? prev.title : p.note?.title || (p.kind === "quick" ? "Quick note" : "Call note"),
    edited: prev?.edited ?? false,
    saved_at: new Date().toISOString(),
  };
  await set(p.id, n);
  return n;
}

export const getNote = (id: string) => get<SavedNote>(id);
export const deleteNote = (id: string) => del(id);
export const deleteAllNotes = () => clear();

export async function listNotes(query = ""): Promise<SavedNote[]> {
  const q = query.trim().toLowerCase();
  const all = (await values<SavedNote>()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!q) return all;
  return all.filter((n) =>
    [n.title, ...(n.note?.summary ?? []), ...(n.note?.items ?? []).map((i) => i.name),
      ...(n.note?.locations ?? []).map((l) => l.name), ...n.participants]
      .join(" ").toLowerCase().includes(q),
  );
}

export async function renameNote(id: string, title: string): Promise<void> {
  const n = await get<SavedNote>(id);
  if (n) await set(id, { ...n, title, edited: true });
}

export const rupees = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const qty = (i: Item) => [i.quantity ?? "", i.unit ?? ""].join(" ").trim() || "—";
export const linePrice = (i: Item): number | null =>
  i.total_price ?? (i.unit_price != null && i.quantity != null ? Math.round(i.unit_price * i.quantity * 100) / 100 : null);
const date = (n: SavedNote) => new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

/** Items grouped by shop (null shop → ""), preserving order. */
export function byShop(items: Item[]): [string, Item[]][] {
  const m = new Map<string, Item[]>();
  for (const i of items) m.set(i.shop ?? "", [...(m.get(i.shop ?? "") ?? []), i]);
  return [...m.entries()];
}

/** Deterministic Markdown export. */
export function toMarkdown(n: SavedNote, withTranscript = true): string {
  const c = n.note;
  const L: string[] = [`# ${n.title}`, "", `${date(n)} · ${n.participants.join(", ")} · ${n.langs.join(", ")}`, ""];
  if (n.error) L.push(`> ${n.error}`, "");
  if (c) {
    L.push("## Summary", ...c.summary.map((s) => `- ${s}`), "");
    if (c.requirements.length) L.push("## Needs", ...c.requirements.map((r) => `- ${r.text}${r.original ? ` — _“${r.original}”_` : ""}`), "");
    if (c.items.length) {
      L.push("## Order");
      for (const [shop, items] of byShop(c.items)) {
        L.push("", shop ? `**${shop}**` : "", "| Item | Qty | Price |", "|---|---|---|");
        for (const i of items) { const p = linePrice(i); L.push(`| ${i.name} | ${qty(i)} | ${p != null ? rupees(p) : "—"} |`); }
        const sub = n.costs?.by_shop.find((s) => (s.shop ?? "") === shop);
        if (sub && sub.priced) L.push(`| **Subtotal** | | **${rupees(sub.subtotal)}**${sub.unpriced ? ` (+${sub.unpriced} unpriced)` : ""} |`);
      }
      if (n.costs?.grand_total != null)
        L.push("", n.costs.unpriced_items ? `Priced items: ${rupees(n.costs.grand_total)} (+${n.costs.unpriced_items} without price)` : `**Total (calculated): ${rupees(n.costs.grand_total)}**`);
      for (const s of c.stated_totals) L.push(`Total said on the call${s.shop ? ` (${s.shop})` : ""}: ${rupees(s.amount)}`);
      L.push("");
    } else if (c.stated_totals.length) L.push(...c.stated_totals.map((s) => `**Total said on the call: ${rupees(s.amount)}**`), "");
    if (c.locations.length) L.push("## Places", ...c.locations.map((l) => `- ${l.name} (${l.kind})`), "");
    if (c.schedule.length) L.push("## When", ...c.schedule.map((s) => `- ${s.when} — ${s.what}${s.where ? ` @ ${s.where}` : ""}`), "");
    if (c.decisions.length) L.push("## Agreed", ...c.decisions.map((d) => `- ${d.text}`), "");
    if (c.action_items.length) L.push("## To do", ...c.action_items.map((a) => `- [ ] ${a.task}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (by ${a.due})` : ""}`), "");
    if (c.open_questions.length) L.push("## Still open", ...c.open_questions.map((q) => `- ${q}`), "");
    if (c.uncertain_spans.length) L.push("## Unclear on the call", ...c.uncertain_spans.map((u) => `- “${u.text}” — ${u.reason}`), "");
  }
  const flags = n.faithfulness?.flags ?? [];
  if (flags.length) L.push("## ⚠ Not found in what was said", ...flags.map((f) => `- ${String(f.value)} (${f.field})`), "");
  if (withTranscript && n.transcript.length) L.push("## Transcript", ...n.transcript.map((t) => `#${t.seq} **${t.name}:** ${t.text}`), "");
  return L.join("\n");
}

/** WhatsApp-formatted plain text (*bold*, bullets) — the format people actually forward. */
export function toWhatsApp(n: SavedNote): string {
  const c = n.note;
  const L: string[] = [`*${n.title}*`, `${date(n)} · ${n.participants.join(", ")}`];
  if (!c) return [...L, "", n.error || "No note."].join("\n");
  L.push("", ...c.summary.map((s) => `• ${s}`));
  if (c.items.length) {
    L.push("", "🛒 *Order*");
    for (const [shop, items] of byShop(c.items)) {
      if (shop) L.push(`_${shop}_`);
      for (const i of items) { const p = linePrice(i); L.push(`• ${i.name} — ${qty(i)}${p != null ? ` — ${rupees(p)}` : ""}`); }
    }
    if (n.costs?.grand_total != null)
      L.push(n.costs.unpriced_items ? `Priced items: ${rupees(n.costs.grand_total)} (+${n.costs.unpriced_items} without price)` : `*Total: ${rupees(n.costs.grand_total)}*`);
  }
  for (const s of c.stated_totals) L.push(`💰 Total said on the call: *${rupees(s.amount)}*`);
  if (c.locations.length) L.push("", "📍 *Places*", ...c.locations.map((l) => `• ${l.name} (${l.kind})`));
  if (c.schedule.length) L.push("", "🗓 *When*", ...c.schedule.map((s) => `• ${s.when} — ${s.what}`));
  if (c.action_items.length) L.push("", "✅ *To do*", ...c.action_items.map((a) => `• ${a.task}${a.owner ? ` — ${a.owner}` : ""}`));
  if ((n.faithfulness?.flag_count ?? 0) > 0) L.push("", `⚠ ${n.faithfulness!.flag_count} item(s) could not be checked against the call.`);
  L.push("", "— Saar");
  return L.join("\n");
}

export function toCSV(n: SavedNote): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["shop", "item", "quantity", "unit", "unit_price_inr", "line_total_inr"]];
  for (const i of n.note?.items ?? []) rows.push([i.shop ?? "", i.name, String(i.quantity ?? ""), i.unit ?? "", String(i.unit_price ?? ""), String(linePrice(i) ?? "")]);
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
