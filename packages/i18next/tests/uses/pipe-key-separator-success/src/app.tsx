import { useTranslation } from "react-i18next";

export function App() {
  const { t: translate } = useTranslation();
  const { t: accountT } = useTranslation("translation", { keyPrefix: "account" });

  return (
    <main>
      <h1>{translate("navigation|home")}</h1>
      <p>{accountT("title")}</p>
    </main>
  );
}
