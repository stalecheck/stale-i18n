import { useTranslation } from "react-i18next";

export function App() {
  const { t: translate } = useTranslation("common", { keyPrefix: "buttons" });
  const [t] = useTranslation("checkout");
  return (
    <>
      {translate("save")}
      {t("common:buttons.cancel")}
      {t(["pay", "fallback"])}
    </>
  );
}
