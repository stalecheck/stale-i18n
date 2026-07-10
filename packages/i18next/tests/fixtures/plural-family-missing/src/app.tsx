import { useTranslation } from "react-i18next";

export function Items({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <>
      <p>{t("presentInOneLocale", { count })}</p>
      <p>{t("absentEverywhere", { count })}</p>
    </>
  );
}
