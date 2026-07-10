/* eslint-disable no-shadow */
import { useIntl } from "react-intl";

export function App() {
  const { formatMessage } = useIntl();

  function withDefault(formatMessage = ({ id }: { id: string }) => id) {
    return formatMessage({ id: "ignored.default" });
  }

  const withNamedExpression = function formatMessage({ id }: { id: string }): string {
    return id === "recurse" ? formatMessage({ id: "ignored.recursive" }) : id;
  };

  return `${withDefault()} ${withNamedExpression({ id: "ignored.named" })} ${formatMessage({ id: "used" })}`;
}
