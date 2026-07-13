import { Trans, useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation(["one", "two"]);

  return (
    <>
      {t("duplicate")}
      <Trans i18nKey="duplicate" t={t} />
      <Trans i18nKey="duplicate" ns={["one", "two"]} />
    </>
  );
}
