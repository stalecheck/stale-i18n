import { useTranslation } from "react-i18next";

export function App({ id }: { id: string }) {
  const { t } = useTranslation();
  return <span>{t(id)}</span>;
}
