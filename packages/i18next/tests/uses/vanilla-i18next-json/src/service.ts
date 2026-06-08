import i18next from "i18next";
import { t } from "i18next";

export function labels() {
  return [i18next.t("ready"), i18next.t("common:cancel"), t("done", { ns: "workflow" })];
}
