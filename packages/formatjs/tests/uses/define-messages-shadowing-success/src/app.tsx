/* eslint-disable no-shadow */
import { defineMessage, defineMessages, useIntl } from "react-intl";

const singleMessage = defineMessage({ id: "profile.single", defaultMessage: "Single" });
const messages = defineMessages({
  title: { id: "profile.title", defaultMessage: "Profile" }
});

export function App() {
  const intl = useIntl();

  {
    const defineMessage = (message: { id: string }) => message;
    const defineMessages = <T extends Record<string, { id: string }>>(value: T) => value;

    defineMessage({ id: "local.single" });
    defineMessages({
      local: { id: "local.title" }
    });
  }

  return (
    <>
      <h1>{intl.formatMessage(messages.title)}</h1>
      <p>{intl.formatMessage(singleMessage)}</p>
    </>
  );
}
