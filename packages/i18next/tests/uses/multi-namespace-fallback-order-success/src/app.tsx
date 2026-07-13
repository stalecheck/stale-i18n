import { Trans, useTranslation } from "react-i18next";

export function App() {
  const { t: oneT } = useTranslation(["one"]);
  const { t: twoT } = useTranslation(["one", "two"]);
  const { t: threeT } = useTranslation(["one", "two", "three"]);

  return (
    <>
      {oneT("first")}
      {twoT("second")}
      {threeT("third")}
      {oneT("first", { ns: ["one"] })}
      {oneT("second", { ns: ["one", "two"] })}
      {oneT("third", { ns: ["one", "two", "three"] })}
      <Trans i18nKey="first" t={oneT} />
      <Trans i18nKey="second" t={twoT} />
      <Trans i18nKey="third" t={threeT} />
      <Trans i18nKey="first" ns={["one"]} />
      <Trans i18nKey="second" ns={["one", "two"]} />
      <Trans i18nKey="third" ns={["one", "two", "three"]} />
    </>
  );
}
