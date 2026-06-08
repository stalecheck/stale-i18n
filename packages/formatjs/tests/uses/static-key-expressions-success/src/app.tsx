import { FormattedMessage, useIntl } from "react-intl";

enum MessageId {
  Title = "dashboard.title"
}

const action = "dashboard.save";
const mode = Math.random() > 0.5 ? "create" : "update";
const state = Math.random() > 0.5 ? "ready" : "pending";
const descriptor = { id: `dashboard.${state}` };

export function App() {
  const intl = useIntl();

  return (
    <>
      <h1>{intl.formatMessage({ id: MessageId.Title })}</h1>
      <button>{intl.formatMessage({ id: action })}</button>
      <span>
        {intl.formatMessage({
          id: mode === "create" ? "dashboard.create" : "dashboard.update"
        })}
      </span>
      <strong>{intl.formatMessage(descriptor)}</strong>
      <FormattedMessage id={mode === "create" ? "dashboard.ctaCreate" : "dashboard.ctaUpdate"} />
    </>
  );
}
