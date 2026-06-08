import { Trans, useTranslation } from "react-i18next";

export function App({ section, keyName }: { section: string; keyName: string }) {
  const { t } = useTranslation();
  const dynamicTemplate = `section.${section}`;

  return (
    <>
      <span>{t(dynamicTemplate)}</span>
      <Trans i18nKey={keyName} />
    </>
  );
}
