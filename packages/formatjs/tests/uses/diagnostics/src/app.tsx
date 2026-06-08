import { FormattedMessage, useIntl } from "react-intl";

export function App({ id }: { id: string }) {
  const intl = useIntl();

  return (
    <>
      <span>{intl.formatMessage({ id: "home.missing" })}</span>
      <span>{intl.formatMessage({ id })}</span>
      <FormattedMessage id="home.empty" />
      <FormattedMessage id="home.onlyEn" />
    </>
  );
}
