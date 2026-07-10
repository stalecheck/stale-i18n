import { Trans, useTranslation } from "react-i18next";

export function PluralExamples({ count }: { count: number }) {
  const { t } = useTranslation();

  return (
    <>
      <p>{t("otherOnly", { count })}</p>
      <p>{t("baseOnly", { count })}</p>
      <p>{t("withOptionalZero", { count })}</p>
      <p>{t("differentForms", { count })}</p>
      <p>{t("guest", { count, context: "male" })}</p>
      <p>{t("position", { count, ordinal: true })}</p>
      <Trans i18nKey="transItems" count={count} />
      <Trans i18nKey="transGuest" count={count} context="female" />
      <Trans i18nKey="transOrdinal" count={count} tOptions={{ ordinal: true }} />
      <Trans i18nKey="transOptions" tOptions={{ count, context: "formal", ordinal: true }} />
    </>
  );
}
