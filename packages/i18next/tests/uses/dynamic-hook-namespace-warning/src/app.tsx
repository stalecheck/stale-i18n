import { useTranslation } from "react-i18next";

export function App({ namespace }: { namespace: string }) {
  const { t } = useTranslation(namespace);
  return <span>{t("title")}</span>;
}
