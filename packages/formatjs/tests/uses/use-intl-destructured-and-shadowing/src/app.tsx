import { FormattedMessage, useIntl } from "react-intl";

export function App() {
  const intl = useIntl();
  const { formatMessage } = useIntl();

  // oxlint-disable-next-line no-shadow
  function localFormat(formatMessage: (descriptor: { id: string }) => string) {
    return formatMessage({ id: "local.shadow" });
  }

  {
    // oxlint-disable-next-line no-shadow
    const FormattedMessage = ({ id }: { id: string }) => <span>{id}</span>;
    // oxlint-disable-next-line no-shadow
    const intl = { formatMessage: ({ id }: { id: string }) => id };
    intl.formatMessage({ id: "local.object" });
    <FormattedMessage id="local.jsx" />;
  }

  return (
    <>
      <h1>{intl.formatMessage({ id: "home.title" })}</h1>
      <button>{formatMessage({ id: "home.save" })}</button>
      <FormattedMessage id="home.subtitle" />
      {localFormat(({ id }) => id)}
    </>
  );
}
