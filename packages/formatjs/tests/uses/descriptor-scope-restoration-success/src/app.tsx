/* eslint-disable no-shadow */
import { defineMessage, useIntl } from "react-intl";

const message = defineMessage({ id: "outer" });

export function App() {
  const intl = useIntl();

  function inner() {
    const message = defineMessage({ id: "inner" });
    return intl.formatMessage(message);
  }

  return `${inner()} ${intl.formatMessage(message)}`;
}
