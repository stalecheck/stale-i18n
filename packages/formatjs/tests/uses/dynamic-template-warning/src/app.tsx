import { useIntl } from "react-intl";

export function App({ section }: { section: string }) {
  const intl = useIntl();
  return <span>{intl.formatMessage({ id: `section.${section}` })}</span>;
}
