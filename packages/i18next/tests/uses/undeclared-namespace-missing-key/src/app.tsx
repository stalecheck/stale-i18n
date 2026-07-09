import { Trans, useTranslation } from "react-i18next";
import i18next, { t as globalT } from "i18next";

export function App() {
  const { t } = useTranslation();
  const { t: adminT } = useTranslation("admin");

  return (
    <>
      <span>{t("admin:title")}</span>
      <span>{t("title", { ns: "reports" })}</span>
      <span>{adminT("heading")}</span>
      <span>{globalT("settings:save")}</span>
      <span>{i18next.t("billing:total")}</span>
      <Trans ns="emails" i18nKey="subject" />
    </>
  );
}
