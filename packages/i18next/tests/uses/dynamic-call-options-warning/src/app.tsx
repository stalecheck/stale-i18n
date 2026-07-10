import { useTranslation } from "react-i18next";

export function App({ namespace, context }: Record<string, string>) {
  const { t } = useTranslation();
  return <span>{t("title", { ns: namespace, context })}</span>;
}
