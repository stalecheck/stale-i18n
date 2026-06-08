import { useTranslation, Trans } from "react-i18next";

export function App({ id }: { id: string }) {
  const { t } = useTranslation();
  // oxlint-disable-next-line no-shadow
  function inner(t: (key: string) => string) {
    return t("local");
  }
  return (
    <>
      <Trans i18nKey="title" ns="common" />
      {t(id)}
      {inner((key) => key)}
    </>
  );
}
