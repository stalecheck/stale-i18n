import { useTranslation } from "react-i18next";

export function Items({ count }: { count: number }) {
  const { t } = useTranslation();
  return <p>{t("items", { count })}</p>;
}
