import { useTranslation } from "react-i18next";

export function App({ enabled }: { enabled: boolean }) {
  const namespace = enabled ? "admin" : "account";
  const keyPrefix = enabled ? "header" : "footer";
  const context = enabled ? "male" : "female";
  const { t } = useTranslation(namespace, { keyPrefix });

  return <span>{t("title", { context })}</span>;
}
