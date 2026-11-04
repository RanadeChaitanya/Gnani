// Full-screen ringing card, shown on any page while Saar is open on this phone.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import Consent from "./Consent";
import { useT } from "../lib/i18n";
import { Incoming, Profile } from "../lib/profile";
import { acceptCall, errText } from "../pages/Join";

export default function IncomingCall({ ring, profile, onDone }: { ring: Incoming; profile: Profile; onDone: () => void }) {
  const { t } = useT();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function accept() {
    setBusy(true);
    try {
      const s = await acceptCall(ring.room_code, profile.name, profile.lang);
      onDone();
      nav(`/room/${s.room_code}`);
    } catch (x) {
      setErr(errText(x, t));
      setBusy(false);
    }
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t("incoming")}>
      <div className="ring-screen">
        <div className="avatar xl pulse">{ring.from_name[0]?.toUpperCase()}</div>
        <h1>{ring.from_name}</h1>
        <Consent />
        {err && <div className="error" role="alert">{err}</div>}
        <button className="primary giant accept" disabled={busy} onClick={accept}>{busy ? "…" : t("acceptJoin")}</button>
        <button className="giant danger" onClick={() => { void api(`/api/calls/${ring.room_code}/decline`, { body: {} }); onDone(); }}>{t("decline")}</button>
      </div>
    </div>
  );
}
