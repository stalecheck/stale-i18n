import { useTranslation } from "react-i18next";

export function Panel() {
  const { t } = useTranslation();
  return <span>{t("panel.title")}</span>;
}
