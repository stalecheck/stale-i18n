import { useIntl as useMessages } from "react-intl";

export function App() {
  return <h1>{useMessages().formatMessage({ id: "home.title" })}</h1>;
}
