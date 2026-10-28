import { Link } from "react-router-dom";
import { useT } from "../lib/i18n";

export default function Home() {
  const { t } = useT();
  return (
    <div className="stack home">
      <h1 className="hero">{t("tagline")}</h1>
      <Link className="btn primary big" to="/setup?mode=create">{t("start")}</Link>
      <Link className="btn big" to="/setup?mode=join">{t("join")}</Link>
      <div className="row center small-text">
        <Link to="/setup?mode=solo" className="muted">{t("solo")}</Link>
        <span className="muted">·</span>
        <Link to="/privacy" className="muted">{t("privacy")}</Link>
      </div>
      <p className="muted small-text center">{t("demo")}</p>
    </div>
  );
}
