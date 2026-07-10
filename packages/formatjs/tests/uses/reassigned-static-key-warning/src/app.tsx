import { useIntl } from "react-intl";

declare const dynamic: string;

export function App() {
  const intl = useIntl();
  let id = "safe";
  id = dynamic;
  return intl.formatMessage({ id });
}
