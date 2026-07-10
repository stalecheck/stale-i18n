/* eslint-disable no-shadow */
import { useTranslation } from "react-i18next";

const { t } = useTranslation("outer");

function first() {
  const { t } = useTranslation("first");
  return t("title");
}

function second() {
  const { t } = useTranslation("second");
  return t("title");
}

first();
second();
t("title");
