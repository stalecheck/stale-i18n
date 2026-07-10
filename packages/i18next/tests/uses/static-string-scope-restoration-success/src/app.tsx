/* eslint-disable no-shadow */
import { useTranslation } from "react-i18next";

const { t } = useTranslation();
const key = "outer";
declare const mode: string;

function inner() {
  const key = "inner";
  return t(key);
}

function block() {
  const key = "block";
  return t(key);
}

function switchBlock() {
  switch (mode) {
    case "local": {
      const key = "switch";
      return t(key);
    }
    default:
      return "";
  }
}

inner();
block();
switchBlock();
t(key);
