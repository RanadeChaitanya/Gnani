// Step 4: both people check the draft. "Correct" → Saar rewrites it with the correction and both check again.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, NotePayload } from "../lib/api";
import { useT } from "../lib/i18n";
import { saveNote, SavedNote } from "../lib/notesDb";
import NoteActions from "./NoteActions";
import NoteDoc from "./NoteDoc";

export default function Review({ n, me, token, names }: { n: SavedNote; me: string; token: string; names: Record<string, string> }) {
  const { t } = useT();
  const nav = useNavigate();
  const [fixing, setFixing] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = n.review?.by[me];
  const waitingOn = Object.entries(n.review?.by ?? {}).filter(([id, v]) => id !== me && v !== "confirmed").map(([id]) => names[id] ?? "?");

  async function send(action: "confirm" | "correct") {
    setBusy(true);
    setErr("");
    try {
      await saveNote(await api<NotePayload>(`/api/rooms/${n.room_code}/notes/${n.id}/review`, { body: { action, text }, token }));
      setFixing(false);
      setText("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false); // the room socket delivers the updated note to both phones
    }
  }

  if (n.status === "pending")
    return (
      <div className="ring-screen">
        <div className="spinner" aria-hidden="true" />
        <h1>{n.review?.corrections.length ? t("rewriting") : t("noteMaking")}</h1>
        <p className="muted center">{t("takesSeconds")}</p>
      </div>
    );
  if (n.status === "failed")
    return (
      <div className="ring-screen">
        <h1>{t("noteFailed")}</h1>
        <p className="muted center">{n.error}</p>
        <button className="big" onClick={() => nav("/")}>{t("home")}</button>
      </div>
    );

  return (
    <div className="stack">
      {!n.review?.final && <div className="stepbar">{t("step4of4")}</div>}
      <NoteDoc n={n} />
      {n.review?.final ? (
        <>
          <NoteActions n={n} />
          <button className="big" onClick={() => nav("/")}>{t("done")}</button>
        </>
      ) : mine === "confirmed" ? (
        <section className="card center stack">
          <strong>✓ {t("youConfirmed")}</strong>
          <p className="muted">{t("waitingOn").replace("{names}", waitingOn.join(", "))}</p>
          <button className="big" onClick={() => setFixing(true)}>{t("somethingWrong")}</button>
        </section>
      ) : null}
      {!n.review?.final && (mine !== "confirmed" || fixing) && (
        <section className="card stack sticky-bottom">
          {!fixing ? (
            <>
              <p className="center"><strong>{t("isCorrect")}</strong></p>
              <button className="primary big" disabled={busy} onClick={() => send("confirm")}>✓ {t("yesCorrect")}</button>
              <button className="big" onClick={() => setFixing(true)}>✎ {t("somethingWrong")}</button>
            </>
          ) : (
            <>
              <label>{t("whatWrong")}
                <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t("whatWrongEg")} />
              </label>
              <button className="primary big" disabled={busy || !text.trim()} onClick={() => send("correct")}>{t("sendCorrection")}</button>
              <button className="linkish" onClick={() => setFixing(false)}>{t("cancel")}</button>
              <p className="muted small-text">{t("correctionHint")}</p>
            </>
          )}
          {err && <div className="error" role="alert">{err}</div>}
        </section>
      )}
    </div>
  );
}
