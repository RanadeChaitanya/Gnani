import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { NotePayload } from "./api";
import { deleteNote, getNote, listNotes, renameNote, saveNote, toMarkdown } from "./notesDb";

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
    summary: ["Two kilo atta, ₹250"],
    key_points: [{ text: "Delivery tomorrow 10:00", evidence: [2] }],
    decisions: [],
    action_items: [{ task: "Deliver atta", owner: "Ravi", due: "tomorrow", evidence: [2, 3] }],
    entities: { people: ["Ravi"], organizations: [], places: [], dates: [], amounts: ["₹250"] },
    open_questions: [],
    uncertain_spans: [],
    conversation_languages: ["en-IN", "mr-IN"],
  },
  faithfulness: { flag_count: 1, flags: [{ field: "summary[0]", value: "9999", reason: "not_found_in_transcript" }], checked_count: 4 },
  transcript: [{ seq: 1, participant_id: "a", name: "Asha", text: "do kilo atta", started_at: 0 }],
});

describe("notesDb", () => {
  it("saves, lists newest first, searches, renames, deletes", async () => {
    await saveNote(payload("n1", "2026-10-28T10:00:00"));
    await saveNote(payload("n2", "2026-10-28T11:00:00"));
    expect((await listNotes()).map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(await listNotes("₹250")).toHaveLength(2);
    expect(await listNotes("nothing-here")).toHaveLength(0);
    await renameNote("n1", "My title");
    await saveNote(payload("n1", "2026-10-28T10:00:00")); // re-delivery keeps the user's title
    expect((await getNote("n1"))?.title).toBe("My title");
    await deleteNote("n1");
    expect(await getNote("n1")).toBeUndefined();
  });

  it("exports deterministic markdown", async () => {
    const n = await saveNote(payload("n3", "2026-10-28T12:00:00"));
    const md = toMarkdown(n);
    expect(md).toContain("# Atta order");
    expect(md).toContain("| Deliver atta | Ravi | tomorrow | #2, #3 |");
    expect(md).toContain("## ⚠ Could not verify in transcript");
    expect(md).toContain("#1 **Asha:** do kilo atta");
    expect(toMarkdown(n)).toBe(md);
  });
});
