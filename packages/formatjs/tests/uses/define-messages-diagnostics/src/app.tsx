import { defineMessage, defineMessages, useIntl } from "react-intl";

declare function getSection(): string;

const missingMessage = defineMessage({ id: "settings.missing", defaultMessage: "Missing" });
const messages = defineMessages({
  dynamic: { id: `settings.${getSection()}`, defaultMessage: "Dynamic" },
  onlyEn: { id: "settings.onlyEn", defaultMessage: "Only English" },
  title: { id: "settings.title", defaultMessage: "Settings" }
});

export function App() {
  const intl = useIntl();

  return (
    <>
      <h1>{intl.formatMessage(messages.title)}</h1>
      <p>{intl.formatMessage(missingMessage)}</p>
      <p>{intl.formatMessage(messages.dynamic)}</p>
      <p>{intl.formatMessage(messages.onlyEn)}</p>
    </>
  );
}
