import { Trans, useTranslation } from "react-i18next";

export function App() {
  const { t: accountT } = useTranslation("account");
  const { t: sectionT } = useTranslation("account", { keyPrefix: "section" });
  const { t: accountAndProfileT } = useTranslation(["account", "profile"]);

  return (
    <>
      <Trans i18nKey="title" t={accountT} />
      <Trans i18nKey="title" t={sectionT} />
      <Trans i18nKey="shared" t={accountAndProfileT} />
      <Trans i18nKey="fallback" t={accountAndProfileT} />
      <Trans i18nKey="title" ns="profile" t={accountT} />
      <Trans i18nKey="fallback" ns={["account", "profile"]} />
      <Trans i18nKey="profile:qualified" t={accountAndProfileT} />
      {accountAndProfileT("shared")}
      {accountAndProfileT("fallback")}
      {accountT("fallback", { ns: ["account", "profile"] })}
      {accountAndProfileT("profile:qualified")}
      <Trans i18nKey="external" t={(key: string) => key} />
    </>
  );
}
