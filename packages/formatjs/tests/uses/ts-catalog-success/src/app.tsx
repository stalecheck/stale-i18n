import { FormattedMessage, useIntl } from "react-intl";

const saveId = "home.save";
const descriptor = { id: "home.descriptor" };

export function App() {
  const intl = useIntl();

  return (
    <>
      <h1>{intl.formatMessage({ id: "home.title" })}</h1>
      <button>{intl.formatMessage({ id: saveId })}</button>
      <span>{intl.formatMessage(descriptor)}</span>
      <FormattedMessage id="home.subtitle" />
    </>
  );
}
