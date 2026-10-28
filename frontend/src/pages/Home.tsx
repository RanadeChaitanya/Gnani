import { Link } from "react-router-dom";
import { useT } from "../lib/i18n";

export default function Home() {
  const { t } = useT();
  return (
    <>
      <h1>{t("tagline")}</h1>
      <p className="muted">
        Two phones, one app-to-app call. Each phone transcribes only its own voice, after both people agree, and
        both get a structured note at the end.
      </p>
      <div className="stack">
        <Link className="btn primary" to="/setup?mode=create">{t("start")}</Link>
        <Link className="btn" to="/setup?mode=join">{t("join")}</Link>
        <Link className="btn" to="/setup?mode=solo">{t("solo")}</Link>
        <Link className="btn" to="/notes">{t("notes")}</Link>
      </div>
      <Link to="/privacy" className="muted">{t("privacy")}</Link>
    </>
  );
}
