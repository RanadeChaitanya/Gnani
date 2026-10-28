import { useEffect, useState } from "react";
import { api, AppConfig, getConfig, lastRoom } from "../lib/api";
import { useT } from "../lib/i18n";
import { deleteAllNotes } from "../lib/notesDb";

export default function Privacy() {
  const { t } = useT();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => void getConfig().then(setCfg), []);
  const last = lastRoom();

  return (
    <>
      <h1>{t("privacy")}</h1>
      <table>
        <thead><tr><th>Data</th><th>Where</th><th>How long</th></tr></thead>
        <tbody>
          <tr><td>Your voice audio</td><td>Streamed to Gnani AI for transcription; relayed to the other phone by LiveKit</td><td>Never saved by Saar</td></tr>
          <tr><td>Transcript text and notes</td><td>Saar server (so both phones receive them)</td><td>Up to {cfg?.retention_hours ?? 24} h, then deleted</td></tr>
          <tr><td>Transcript text</td><td>DeepSeek (the AI model that writes the note)</td><td>Per DeepSeek's API terms</td></tr>
          <tr><td>Saved notes</td><td>This device only (IndexedDB)</td><td>Until you delete them</td></tr>
          <tr><td>Consent log</td><td>Saar server: who agreed, when, notice version (no IP)</td><td>Same {cfg?.retention_hours ?? 24} h</td></tr>
        </tbody>
      </table>
      <p className="muted">
        Saar is an app-to-app call, not a phone-network call: it never taps phone lines. Capture starts only after
        everyone agrees, and anyone can stop it at any time. This is a prototype and not legal advice.
      </p>
      <button className="danger" onClick={() => confirm("Delete all notes on this device?") && deleteAllNotes().then(() => setMsg("All notes on this device deleted."))}>
        Delete everything on this device
      </button>
      {last && (
        <button className="danger" onClick={() => api(`/api/rooms/${last.room_code}/data`, { method: "DELETE", token: last.token })
          .then(() => setMsg(`Server data for room ${last.room_code} deleted.`)).catch((e) => setMsg(e.message))}>
          Delete server data for my last room ({last.room_code})
        </button>
      )}
      {msg && <p role="status">{msg}</p>}
      <p className="muted">Version {cfg?.version}</p>
    </>
  );
}
