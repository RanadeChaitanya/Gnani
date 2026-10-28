// Local-first notes in IndexedDB (spec §11.3). The device copy is the durable one.
import { clear, del, get, set, values } from "idb-keyval";
import type { NotePayload } from "./api";

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
    [n.title, ...(n.note?.summary ?? []), ...Object.values(n.note?.entities ?? {}).flat(), ...n.participants]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

export async function renameNote(id: string, title: string): Promise<void> {
  const n = await get<SavedNote>(id);
  if (n) await set(id, { ...n, title, edited: true });
}

const cite = (e: number[]) => (e.length ? ` _(#${e.join(", #")})_` : "");

/** Deterministic Markdown export. */
export function toMarkdown(n: SavedNote, withTranscript = true): string {
  const c = n.note;
  const L: string[] = [`# ${n.title}`, "", `- Date: ${n.created_at.slice(0, 16).replace("T", " ")} UTC`];
  L.push(`- Participants: ${n.participants.join(", ")}`, `- Languages: ${n.langs.join(", ")}`, `- Kind: ${n.kind}`, "");
  if (n.error) L.push(`> ${n.error}`, "");
  if (c) {
    L.push("## Summary", ...c.summary.map((s) => `- ${s}`), "");
    if (c.key_points.length) L.push("## Key points", ...c.key_points.map((k) => `- ${k.text}${cite(k.evidence)}`), "");
    if (c.decisions.length) L.push("## Decisions", ...c.decisions.map((k) => `- ${k.text}${cite(k.evidence)}`), "");
    if (c.action_items.length) {
      L.push("## Action items", "", "| Task | Owner | Due | Evidence |", "|---|---|---|---|");
      for (const a of c.action_items)
        L.push(`| ${a.task} | ${a.owner ?? "—"} | ${a.due ?? "—"} | #${a.evidence.join(", #")} |`);
      L.push("");
    }
    const ents = Object.entries(c.entities).filter(([, v]) => v.length);
    if (ents.length) L.push("## Entities", ...ents.map(([k, v]) => `- ${k}: ${v.join(", ")}`), "");
    if (c.open_questions.length) L.push("## Open questions", ...c.open_questions.map((q) => `- ${q}`), "");
    if (c.uncertain_spans.length)
      L.push("## Uncertain", ...c.uncertain_spans.map((u) => `- ${u.text} — ${u.reason}${cite(u.evidence)}`), "");
  }
  const flags = n.faithfulness?.flags ?? [];
  if (flags.length)
    L.push("## ⚠ Could not verify in transcript", ...flags.map((f) => `- ${f.field}: ${String(f.value)} (${f.reason})`), "");
  if (withTranscript && n.transcript.length)
    L.push("## Transcript", ...n.transcript.map((t) => `#${t.seq} **${t.name}:** ${t.text}`), "");
  return L.join("\n");
}
