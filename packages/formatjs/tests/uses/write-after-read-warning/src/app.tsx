import { useIntl } from "react-intl";

declare const dynamic: string;

export function App() {
  const intl = useIntl();
  let id = "safe";
  const before = intl.formatMessage({ id });
  id = dynamic;
  const after = intl.formatMessage({ id });
  return `${before} ${after}`;
}
