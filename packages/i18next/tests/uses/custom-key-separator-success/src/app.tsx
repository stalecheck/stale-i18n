import { useTranslation } from "react-i18next";

export function App({ count }: { count: number }) {
  const { t: translate } = useTranslation();
  const { t: sectionT } = useTranslation("translation", { keyPrefix: "section" });

  return (
    <main>
      <h1>{translate("shared/title")}</h1>
      <p>{sectionT("title")}</p>
      <span>{translate("cart/items", { count })}</span>
    </main>
  );
}
