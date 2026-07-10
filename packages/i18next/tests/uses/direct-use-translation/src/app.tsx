import { useTranslation as useMessages } from "react-i18next";

export function App() {
  return <button>{useMessages("common", { keyPrefix: "buttons" }).t("save")}</button>;
}
