import { Trans, useTranslation } from "react-i18next";

enum AccountKey {
  Title = "account.title"
}

const saveKey = "actions.save";
const cancelKey = `actions.cancel`;
const transKey = "account.summary";

export function App({ mode }: { mode: "new" | "edit" }) {
  const { t } = useTranslation();
  const modeKey = mode === "new" ? "mode.create" : "mode.update";
  const state = mode === "new" ? "ready" : "pending";
  const stateKey = `state.${state}`;

  return (
    <>
      <h1>{t(AccountKey.Title)}</h1>
      <button>{t(saveKey)}</button>
      <button>{t(cancelKey)}</button>
      <span>{t(modeKey)}</span>
      <strong>{t(stateKey)}</strong>
      <Trans i18nKey={transKey} />
    </>
  );
}
