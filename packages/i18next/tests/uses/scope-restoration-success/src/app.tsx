/* eslint-disable no-shadow */
import { useTranslation } from "react-i18next";

const { t } = useTranslation("a");

function inner() {
  const { t } = useTranslation("b");
  return t("inside");
}

inner();
t("after");
