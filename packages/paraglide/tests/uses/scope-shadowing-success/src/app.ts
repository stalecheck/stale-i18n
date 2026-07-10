/* eslint-disable no-shadow */
import { m } from "./paraglide/messages.js";

function classShadow() {
  // oxlint-disable-next-line typescript/no-extraneous-class
  class m {
    static ignored() {
      return "ignored";
    }
  }
  return m.ignored();
}

function catchShadow() {
  try {
    throw { ignored: () => "ignored" };
  } catch (m) {
    // @ts-expect-error Deliberately exercise a catch binding that shadows the import.
    return m.ignored();
  }
}

export function title() {
  return `${classShadow()} ${catchShadow()} ${m.valid()}`;
}
