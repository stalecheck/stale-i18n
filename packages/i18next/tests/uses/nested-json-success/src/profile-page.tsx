import { useTranslation } from "react-i18next";

export function ProfilePage() {
  const { t } = useTranslation("profile");
  return <h1>{t("header.title")}</h1>;
}
