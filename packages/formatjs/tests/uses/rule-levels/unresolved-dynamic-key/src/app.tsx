import { FormattedMessage } from "react-intl";

export function App({ id }: { id: string }) {
  return <FormattedMessage id={id} />;
}
