/* eslint-disable no-shadow */
import { FormattedMessage, useIntl } from "react-intl";

export function App() {
  const { formatMessage } = useIntl();

  function functionShadow() {
    function formatMessage({ id }: { id: string }) {
      return id;
    }
    return formatMessage({ id: "ignored.function" });
  }

  function classShadow() {
    class FormattedMessage {
      id = "local";
    }
    return <FormattedMessage id="ignored.class" />;
  }

  try {
    throw new Error("local");
  } catch (formatMessage) {
    formatMessage({ id: "ignored.catch" });
  }

  return (
    <>
      {functionShadow()}
      {classShadow()}
      {formatMessage({ id: "used.call" })}
      <FormattedMessage id="used.jsx" />
    </>
  );
}
