declare module "react-intl" {
  export function useIntl(): {
    formatMessage(descriptor: { id: string }): string;
  };

  export function FormattedMessage(props: { id: string }): unknown;

  export function defineMessage<T extends { id: string }>(message: T): T;

  export function defineMessages<T extends Record<string, { id: string }>>(messages: T): T;
}
