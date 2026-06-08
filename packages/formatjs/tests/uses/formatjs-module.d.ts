declare module "react-intl" {
  export function useIntl(): {
    formatMessage(descriptor: { id: string }): string;
  };

  export function FormattedMessage(props: { id: string }): unknown;
}
