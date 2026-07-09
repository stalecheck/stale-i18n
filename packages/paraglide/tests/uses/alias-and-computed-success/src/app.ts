import { m as messages } from "./paraglide/messages.js";

export function action(primary: boolean) {
  return messages[primary ? "save_button" : "cancel_button"]();
}
