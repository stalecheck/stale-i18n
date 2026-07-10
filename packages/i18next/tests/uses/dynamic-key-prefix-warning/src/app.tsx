import { useTranslation } from "react-i18next";

export function App({ keyPrefix }: { keyPrefix: string }) {
  const { t } = useTranslation("translation", { keyPrefix });
  return <span>{t("title")}</span>;
}
