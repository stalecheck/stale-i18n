import { Trans, useTranslation } from "react-i18next";

export function CheckoutPage() {
  const { t } = useTranslation(["common", "checkout"]);

  return (
    <section>
      <h1>{t("title")}</h1>
      <Trans i18nKey="summary" ns="checkout" />
      <button>{t("pay", { ns: "checkout" })}</button>
      <a>{t("common:help")}</a>
    </section>
  );
}
