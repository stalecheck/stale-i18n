import { Trans, useTranslation } from "react-i18next";

export function App({ namespace, prefix, context }: Record<string, string>) {
  const { t } = useTranslation(namespace, { keyPrefix: prefix });

  return (
    <>
      <span>{t("title", { context })}</span>
      <Trans i18nKey="title" ns={namespace} context={context} />
    </>
  );
}
