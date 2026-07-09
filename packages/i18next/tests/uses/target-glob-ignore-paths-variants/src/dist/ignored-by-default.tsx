import { useTranslation } from "react-i18next";

export function IgnoredByDefault() {
  const { t } = useTranslation();
  return <span>{t("dist.missing")}</span>;
}
