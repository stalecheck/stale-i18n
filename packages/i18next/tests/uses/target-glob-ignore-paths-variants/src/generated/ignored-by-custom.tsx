import { useTranslation } from "react-i18next";

export function IgnoredByCustom() {
  const { t } = useTranslation();
  return <span>{t("generated.missing")}</span>;
}
