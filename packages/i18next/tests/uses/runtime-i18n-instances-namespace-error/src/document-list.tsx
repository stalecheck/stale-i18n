import { useTranslation } from "react-i18next";

export function DocumentList() {
  const { t } = useTranslation("documents");

  return (
    <>
      {t("title")}
      {t("checkout.pay")}
      {t("payments:checkout.pay")}
    </>
  );
}
