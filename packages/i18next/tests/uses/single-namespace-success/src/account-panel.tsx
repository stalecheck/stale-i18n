import { useTranslation } from "react-i18next";

export function AccountPanel() {
  const { t } = useTranslation("account");
  return <h1>{t("title")}</h1>;
}
