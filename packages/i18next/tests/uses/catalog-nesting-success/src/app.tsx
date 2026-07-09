import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();

  return (
    <>
      <p>{t("nesting1")}</p>
      <p>{t("crossNamespace")}</p>
    </>
  );
}
