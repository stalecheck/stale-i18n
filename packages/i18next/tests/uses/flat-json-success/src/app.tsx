import { useTranslation } from "react-i18next";

export function ProfilePage() {
  const { t } = useTranslation();
  return <h1>{t("profile.title")}</h1>;
}
