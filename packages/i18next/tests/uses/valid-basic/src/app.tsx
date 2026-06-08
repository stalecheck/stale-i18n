import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  return <button>{t("common.save")}</button>;
}
