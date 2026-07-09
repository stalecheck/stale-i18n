import { useTranslation } from "react-i18next";

export function AdminPage() {
  const { t } = useTranslation("admin");
  return <span>{t("title")}</span>;
}
