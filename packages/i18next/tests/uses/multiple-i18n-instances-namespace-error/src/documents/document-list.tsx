import { useTranslation } from "react-i18next";
import { documentsI18n } from "./i18n";

export function DocumentList() {
  void documentsI18n;

  const { t } = useTranslation("documents");

  return (
    <>
      {t("title")}
      {t("checkout.pay")}
      {t("payments:checkout.pay")}
    </>
  );
}
