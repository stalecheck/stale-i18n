import {
  defineMessage,
  defineMessages as defineAppMessages,
  FormattedMessage,
  useIntl
} from "react-intl";

const suffix = "label";
const singleMessage = defineMessage({ id: "home.single", defaultMessage: "Single" });
const messages = defineAppMessages({
  title: { id: "home.title", defaultMessage: "Home" },
  save: { id: `home.${suffix}`, defaultMessage: "Save" },
  bracket: { id: "home.bracket", defaultMessage: "Bracket" }
});

export function App() {
  const intl = useIntl();
  const { formatMessage } = useIntl();

  return (
    <>
      <h1>{intl.formatMessage(messages.title)}</h1>
      <button>{formatMessage(messages.save)}</button>
      <span>{intl.formatMessage(messages["bracket"])}</span>
      <strong>{intl.formatMessage(singleMessage)}</strong>
      <FormattedMessage id="home.inline" />
    </>
  );
}
