import { Trans } from "react-i18next";

export function App({ enabled }: { enabled: boolean }) {
  const namespace = enabled ? "admin" : "account";
  const context = enabled ? "male" : "female";
  return <Trans i18nKey="title" ns={namespace} context={context} />;
}
