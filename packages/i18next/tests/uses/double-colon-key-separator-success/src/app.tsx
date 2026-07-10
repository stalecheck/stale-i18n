import { useTranslation } from "react-i18next";

export function App() {
  const { t: translate } = useTranslation();
  const { t: sectionT } = useTranslation("translation", { keyPrefix: "section" });

  return (
    <main>
      <h1>{translate("shared::title")}</h1>
      <p>{sectionT("title")}</p>
    </main>
  );
}
