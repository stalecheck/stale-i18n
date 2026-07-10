/* eslint-disable no-shadow */
import { useIntl } from "react-intl";

declare const dynamic: string;
const id = "outer";

export function App() {
  const intl = useIntl();

  function inner() {
    let id = "inner";
    id = dynamic;
    return intl.formatMessage({ id });
  }

  return `${inner()} ${intl.formatMessage({ id })}`;
}
