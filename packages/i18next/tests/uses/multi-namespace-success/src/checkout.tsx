import { useTranslation } from "react-i18next";

export function Checkout() {
  const { t } = useTranslation(["common", "checkout"]);
  return (
    <>
      {t("save")}
      {t("pay", { ns: "checkout" })}
      {t("checkout:cancel")}
    </>
  );
}
