import { useTranslation } from "react-i18next";

export function Settings() {
  const { t } = useTranslation("settings");
  return <>{t("missing")}</>;
}
