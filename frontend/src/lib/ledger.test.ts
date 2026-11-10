import { expect, it } from "vitest";
import type { SavedNote } from "./notesDb";
import { ledgerCSV, ledgers, smartRecord, spokenLang, waDraft, waLink } from "./ledger";

const note = (id: string, at: string, items: { name: string; quantity: number; unit: string; unit_price: number | null }[], speech: [string, string, string][], final = true) =>
  ({
    id, room_code: "R", kind: "final", status: "ready", created_at: at, model: "", error: "", participants: ["Lal", "Gupta ji"], langs: [],
    note: { title: "Order", items: items.map((i) => ({ ...i, total_price: null, shop: null, heard_as: null })), action_items: [{ task: "Deliver Friday" }], uncertain_spans: [] },
    costs: { grand_total: items.reduce((t, i) => t + (i.unit_price ?? 0) * i.quantity, 0) },
    faithfulness: null, review: { by: {}, final, corrections: [] },
    transcript: speech.map(([name, text, lang_code], seq) => ({ seq, participant_id: name, name, text, started_at: seq, lang_code })),
    title: "Order", edited: false, saved_at: at,
  }) as unknown as SavedNote;

const a = note("a", "2026-11-01T10:00:00Z", [{ name: "Sugar", quantity: 5, unit: "cartons", unit_price: 1500 }], [["Gupta ji", "हो, पाठवतो.", "mr-IN"], ["Lal", "Paanch carton", "hi-IN"]]);
const b = note("b", "2026-11-05T10:00:00Z", [{ name: "Sugar", quantity: 4, unit: "cartons", unit_price: 1600 }, { name: "Oil", quantity: 2, unit: "tins", unit_price: null }], [["Gupta ji", "दोन डबे तेल पण पाठवतो, ठीक आहे.", "mr-IN"]], false);
const solo = { ...a, id: "s", participants: ["Lal"] } as SavedNote;

it("groups calls by the other person and skips solo notes", () => {
  const ls = ledgers([a, solo, b], "lal");
  expect(ls.map((l) => [l.name, l.notes.map((n) => n.id)])).toEqual([["Gupta ji", ["b", "a"]]]);
});

it("builds a factual record: rates move, totals add, open tasks come from the latest call", () => {
  const r = smartRecord(ledgers([a, b], "Lal")[0]);
  expect([r.calls, r.confirmed, r.spent, r.lastCall]).toEqual([2, 1, 7500 + 6400, "2026-11-05T10:00:00Z"]);
  expect(r.items[0]).toEqual({ name: "Sugar", times: 2, lastQty: "4 cartons", rate: 1600, prevRate: 1500 });
  expect(r.items[1].rate).toBeNull();
  expect(r.openTasks).toEqual(["Deliver Friday"]);
});

it("drafts in the language the person spoke, and links to their WhatsApp", () => {
  const l = ledgers([a, b], "Lal")[0];
  expect(spokenLang(l)).toBe("mr");
  const mr = waDraft(l, "Lal", "mr");
  expect(mr).toContain("नमस्कार Gupta ji,");
  expect(waDraft({ ...l, name: "Mehta" }, "Lal", "en")).toContain("Namaste Mehta ji,");
  expect(mr).toContain("• Sugar — 4 cartons — ₹6,400");
  expect(waDraft(l, "Lal", "en")).toContain("Please confirm this order.");
  expect(waLink("98765 43210", "hi there")).toBe("https://wa.me/919876543210?text=hi%20there");
});

it("exports one Excel-ready sheet with a row per item per call", () => {
  const csv = ledgerCSV(ledgers([a, b], "Lal"));
  expect(csv.startsWith("﻿")).toBe(true);
  const rows = csv.slice(1).split("\r\n");
  expect(rows).toHaveLength(4);
  expect(rows[1]).toBe('"2026-11-05","Gupta ji","Order","Sugar","4","cartons","1600","6400","no"');
});
