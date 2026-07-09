import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  return <span>{t("summary")}</span>;
}
