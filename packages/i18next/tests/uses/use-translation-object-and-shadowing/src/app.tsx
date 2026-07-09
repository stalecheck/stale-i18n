import { Trans, useTranslation } from "react-i18next";

export function App({ id }: { id: string }) {
  const translation = useTranslation("common");
  const { t } = useTranslation("common");

  // oxlint-disable-next-line no-shadow
  function localT(t: (key: string) => string) {
    return t("local.shadow");
  }

  {
    // oxlint-disable-next-line no-shadow
    const Trans = ({ children }: { children: unknown }) => <span>{children}</span>;
    // oxlint-disable-next-line no-shadow
    const translation = { t: (key: string) => key };
    translation.t("local.object");
    <Trans>Local</Trans>;
  }

  return (
    <>
      <button>{translation.t("save")}</button>
      <span>{t(id)}</span>
      <Trans i18nKey="title" ns="common" />
      {localT((key) => key)}
    </>
  );
}
