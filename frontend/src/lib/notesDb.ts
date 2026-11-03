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
    [n.title, n.note?.outcome ?? "", ...(n.note?.items ?? []).map((i) => i.name),
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

/** "Total" only when every item has a price; otherwise it's a partial sum and says so. */
export function totalLine(n: SavedNote): string | null {
  const c = n.costs;
  if (c?.grand_total == null) return null;
  return c.unpriced_items ? `Priced items: ${rupees(c.grand_total)} (+${c.unpriced_items} without price)` : `Total: ${rupees(c.grand_total)}`;
}

export const isFinal = (n: NotePayload) => !!n.review?.final;
const who = (n: SavedNote) => {
  const roles = new Map((n.note?.parties ?? []).map((p) => [p.name, p.role]));
  return n.participants.map((p) => (roles.get(p) ? `${p} (${roles.get(p)})` : p)).join(", ");
};

/** Formal call minutes in Markdown: numbered sections, only those with content. Used for .md, Notion and notes apps. */
export function toMarkdown(n: SavedNote, withTranscript = true): string {
  const c = n.note;
  const L: string[] = [`# ${n.title}`, "",
    `**Date:** ${date(n)}  `, `**Participants:** ${who(n)}  `,
    `**Status:** ${isFinal(n) ? "Confirmed by all participants" : "Draft — not yet confirmed"}`, ""];
  if (n.error) L.push(`> ${n.error}`, "");
  if (c) {
    let k = 0;
    const sec = (title: string, lines: string[]) => lines.length && L.push(`## ${++k}. ${title}`, ...lines, "");
    sec("Purpose", [c.purpose || c.outcome]);
    sec("Outcome", [c.outcome]);
    sec("Summary", [c.summary.join(" ")]);
    if (c.items.length) {
      const rows: string[] = [];
      for (const [shop, items] of byShop(c.items)) {
        rows.push(...(shop ? [`**${shop}**`, ""] : []), "| Item | Quantity | Amount |", "|---|---|---|");
        for (const i of items) {
          const p = linePrice(i);
          rows.push(`| ${i.name}${i.heard_as ? ` (heard “${i.heard_as}”)` : ""} | ${qty(i)} | ${p != null ? rupees(p) : "—"} |`);
        }
        rows.push("");
      }
      const tl = totalLine(n);
      if (tl) rows.push(`**${tl}**`);
      for (const s of c.stated_totals) rows.push(`Total stated on the call${s.shop ? ` (${s.shop})` : ""}: **${rupees(s.amount)}**`);
      sec("Order details", rows);
    }
    sec("Decisions", c.decisions.map((d) => `- ${d.text}`));
    sec("Action items", c.action_items.length
      ? ["| Task | Owner | Due |", "|---|---|---|", ...c.action_items.map((a) => `| ${a.task} | ${a.owner ?? "—"} | ${a.due ?? "—"} |`)] : []);
    sec("Schedule and locations", [...c.schedule.map((s) => `- ${s.when} — ${s.what}${s.where ? `, ${s.where}` : ""}`),
      ...c.locations.map((l) => `- ${l.name} (${l.kind})`)]);
    sec("Points to confirm", c.uncertain_spans.map((u) => `- ${u.text}`));
    if (n.review?.corrections.length) sec("Corrections by participants", n.review.corrections.map((x) => `- ${x.name}: ${x.text}`));
  }
  if (withTranscript && n.transcript.length) L.push("## Appendix: transcript", ...n.transcript.map((t) => `#${t.seq} **${t.name}:** ${t.text}`), "");
  return L.join("\n");
}

/** The same minutes as plain text, for notes apps (Samsung Notes, Keep) that show Markdown symbols raw. */
export function toText(n: SavedNote): string {
  return toMarkdown(n, false)
    .split("\n")
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
    .map((l) => l.replace(/^# (.*)/, (_, x: string) => x.toUpperCase()).replace(/^## /, "\n").replace(/\*\*/g, "").replace(/ {2}$/, "")
      .replace(/^\| (.*) \|$/, (_, x: string) => `• ${x.split(" | ").join(" — ")}`))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n\n— Saar";
}

/** WhatsApp-formatted plain text (*bold*, bullets) — the format people actually forward. */
export function toWhatsApp(n: SavedNote): string {
  const c = n.note;
  const L: string[] = [`*${n.title}*`, date(n)];
  if (!c) return [...L, "", n.error || "No note."].join("\n");
  L.push("", c.outcome);
  if (!isFinal(n)) L.push("_Draft — not yet confirmed_");
  if (c.items.length) {
    L.push("", "🛒 *Order*");
    for (const [shop, items] of byShop(c.items)) {
      if (shop) L.push(`_${shop}_`);
      for (const i of items) { const p = linePrice(i); L.push(`• ${i.name} — ${qty(i)}${p != null ? ` — ${rupees(p)}` : ""}`); }
    }
    const tl = totalLine(n);
    if (tl) L.push(`*${tl}*`);
  }
  for (const s of c.stated_totals) L.push(`💰 Total said: *${rupees(s.amount)}*`);
  if (c.schedule.length) L.push("", ...c.schedule.map((s) => `🗓 ${s.when} — ${s.what}`));
  if (c.locations.length) L.push(...c.locations.map((l) => `📍 ${l.name}`));
  if (c.uncertain_spans.length) L.push("", "❓ *Please check*", ...c.uncertain_spans.map((u) => `• ${u.text}`));
  L.push("", "— Saar");
  return L.join("\n");
}

export function toCSV(n: SavedNote): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["shop", "item", "quantity", "unit", "unit_price_inr", "line_total_inr"]];
  for (const i of n.note?.items ?? []) rows.push([i.shop ?? "", i.name, String(i.quantity ?? ""), i.unit ?? "", String(i.unit_price ?? ""), String(linePrice(i) ?? "")]);
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
