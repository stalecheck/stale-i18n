import { useTranslation } from "react-i18next";

export function Inbox({ count }: { count: number }) {
  const { t } = useTranslation();

  return (
    <>
      <p>{t("message", { count })}</p>
      <p>{t("invite", { context: "female" })}</p>
      <p>{t("guest", { count, context: "male" })}</p>
    </>
  );
}
