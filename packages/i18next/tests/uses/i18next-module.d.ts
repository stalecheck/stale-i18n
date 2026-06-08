declare module "i18next" {
  export function t(key: string, options?: { ns?: string }): string;

  const i18next: {
    t(key: string, options?: { ns?: string }): string;
  };

  export default i18next;
}
