import { Trans, useTranslation } from "react-i18next";

export function DocumentList() {
  const { t } = useTranslation(["documents", "payments"]);

  return (
    <>
      {t("title")}
      {t("checkout.pay")}
      {t("payments:checkout.pay")}
      {t("documents:checkout.pay")}
      <Trans i18nKey="documents:checkout.pay" ns={["documents", "payments"]} />
    </>
  );
}
