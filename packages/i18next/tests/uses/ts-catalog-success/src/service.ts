import i18next from "i18next";
import { t } from "i18next";

export function labels() {
  return [i18next.t("common:ready"), t("done", { ns: "workflow" })];
}
