import { Link } from "react-router-dom";
import { useT } from "../lib/i18n";

export default function Home() {
  const { t } = useT();
  return (
    <div className="stack home">
      <section className="hero">
        <h1>{t("tagline")}</h1>
        <p className="muted">{t("sub")}</p>
      </section>
      <Link className="btn primary big" to="/setup?mode=create">📞 {t("start")}</Link>
      <Link className="btn big" to="/setup?mode=join">🔗 {t("join")}</Link>
      <div className="row">
        <Link className="btn grow" to="/notes">📝 {t("notes")}</Link>
        <Link className="btn grow" to="/setup?mode=solo">🎙️ {t("solo")}</Link>
      </div>
      <ol className="how muted">
        <li>Start a call and show the QR code.</li>
        <li>The other person scans it and taps agree.</li>
        <li>Talk. Captions appear live on both phones.</li>
        <li>End the call — both get a clean note with items, prices, places and times.</li>
      </ol>
      <Link to="/privacy" className="muted center">{t("privacy")}</Link>
    </div>
  );
}
