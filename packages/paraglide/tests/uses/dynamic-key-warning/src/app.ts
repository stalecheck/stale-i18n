import { m } from "./paraglide/messages.js";

export function title(key: string) {
  return m[key]!();
}
