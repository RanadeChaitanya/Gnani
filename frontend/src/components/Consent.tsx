// Consent stays on screen, in one line; the full notice is one tap away.
import { useT } from "../lib/i18n";

export default function Consent() {
  const { t } = useT();
  return <p className="consent-line center">{t("consentShort")} <a href="/privacy" target="_blank" rel="noopener">{t("details")}</a></p>;
}
