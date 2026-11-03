import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { NotePayload } from "./api";
import { deleteNote, getNote, listNotes, renameNote, saveNote, toCSV, toMarkdown, toText, toWhatsApp } from "./notesDb";

const payload = (id: string, created: string): NotePayload => ({
  id,
  room_code: "ABC234",
  kind: "final",
  status: "ready",
  created_at: created,
  model: "mock",
  error: "",
  participants: ["Asha", "Ravi"],
  langs: ["en-IN", "mr-IN"],
  note: {
    title: "Atta order",
    note_language: "en",
    conversation_type: "order",
    purpose: "Asha placed a grocery order with Ravi Kirana.",
    outcome: "Ravi Kirana delivers 2 kg atta and 1 litre oil to Gandhi Nagar tomorrow at 10.",
    summary: ["2 kg atta and 1 litre oil from Ravi Kirana"],
    parties: [{ name: "Ravi", role: "shopkeeper" }],
    items: [
      { name: "atta", quantity: 2, unit: "kg", unit_price: 50, total_price: null, shop: "Ravi Kirana", evidence: [1] },
      { name: "oil", quantity: 1, unit: "litre", unit_price: null, total_price: 140, shop: "Ravi Kirana", evidence: [2] },
      { name: "arhar dal", quantity: 10, unit: "kg", unit_price: null, total_price: null, shop: null, heard_as: "har bhara daur", evidence: [2] },
    ],
    stated_totals: [{ amount: 240, shop: "Ravi Kirana", evidence: [2] }],
    locations: [{ name: "Gandhi Nagar", kind: "delivery", evidence: [2] }],
    schedule: [{ what: "delivery", when: "tomorrow 10:00", where: "Gandhi Nagar", evidence: [2] }],
    decisions: [],
    action_items: [{ task: "Deliver atta", owner: "Ravi", due: "tomorrow", evidence: [2, 3] }],
    uncertain_spans: [{ text: "Sugar: 8 kg or 50 kg?", reason: "two versions", evidence: [1] }],
    conversation_languages: ["en-IN", "mr-IN"],
  },
  costs: {
    by_shop: [{ shop: "Ravi Kirana", subtotal: 240, priced: 2, unpriced: 0 }, { shop: null, subtotal: 0, priced: 0, unpriced: 1 }],
    grand_total: 240,
    unpriced_items: 1,
    stated_totals: [{ amount: 240, shop: "Ravi Kirana", evidence: [2] }],
  },
  faithfulness: { flag_count: 1, flags: [{ field: "summary[0]", value: "9999", reason: "not_found_in_transcript" }], checked_count: 4 },
  review: { by: { a: "confirmed", b: "confirmed" }, final: true, corrections: [{ name: "Ravi", text: "Oil is 1 litre" }] },
  transcript: [{ seq: 1, participant_id: "a", name: "Asha", text: "do kilo atta", started_at: 0 }],
});

describe("notesDb", () => {
  it("saves, lists newest first, searches items and places, renames, deletes", async () => {
    await saveNote(payload("n1", "2026-10-28T10:00:00"));
    await saveNote(payload("n2", "2026-10-28T11:00:00"));
    expect((await listNotes()).map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(await listNotes("gandhi nagar")).toHaveLength(2);
    expect(await listNotes("arhar")).toHaveLength(2);
    expect(await listNotes("nothing-here")).toHaveLength(0);
    await renameNote("n1", "My title");
    await saveNote(payload("n1", "2026-10-28T10:00:00")); // re-delivery keeps the user's title
    expect((await getNote("n1"))?.title).toBe("My title");
    await deleteNote("n1");
    expect(await getNote("n1")).toBeUndefined();
  });

  it("exports compact minutes: key facts, short lists, order table, totals, status", async () => {
    const n = await saveNote(payload("n3", "2026-10-28T12:00:00"));
    const md = toMarkdown(n);
    expect(md).toContain("# Atta order");
    expect(md).toContain("Asha, Ravi (shopkeeper) · Confirmed by all participants");
    expect(md).toContain("**Purpose:** Asha placed a grocery order with Ravi Kirana.");
    expect(md).toContain("**Outcome:** Ravi Kirana delivers 2 kg atta");
    expect(md).toContain("## To confirm\n- Sugar: 8 kg or 50 kg?");
    expect(md).toContain("## Key points\n- 2 kg atta and 1 litre oil from Ravi Kirana");
    expect(md).toContain("| arhar dal (heard “har bhara daur”) | 10 kg | — |");
    expect(md).toContain("| atta | 2 kg | ₹100 |");
    expect(md).toContain("Priced items: ₹240 (+1 without price)");
    expect(md).toContain("- [ ] Deliver atta — Ravi, tomorrow");
    expect(md).toContain("- Gandhi Nagar (delivery)");
    expect(md).toContain("- Ravi: Oil is 1 litre");
    expect(md).not.toMatch(/## \d/);
    expect(toMarkdown(n)).toBe(md);
    const txt = toText(n);
    expect(txt.startsWith("ATTA ORDER")).toBe(true);
    expect(txt).not.toContain("**");
    expect(txt).toContain("• atta — 2 kg — ₹100");
    expect(txt).toContain("☐ Deliver atta — Ravi, tomorrow");
  });

  it("exports WhatsApp text and CSV", async () => {
    const n = await saveNote(payload("n4", "2026-10-28T12:00:00"));
    const wa = toWhatsApp(n);
    expect(wa).toContain("*Atta order*");
    expect(wa).toContain("• atta — 2 kg — ₹100");
    expect(wa).toContain("Priced items: ₹240 (+1 without price)");
    expect(wa).toContain("📍 Gandhi Nagar");
    expect(wa).toContain("❓ *Please check*\n• Sugar: 8 kg or 50 kg?");
    const csv = toCSV(n).split("\n");
    expect(csv[0]).toBe('"shop","item","quantity","unit","unit_price_inr","line_total_inr"');
    expect(csv[1]).toBe('"Ravi Kirana","atta","2","kg","50","100"');
  });
});
