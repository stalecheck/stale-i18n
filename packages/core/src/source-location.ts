import type { SourceLocation } from "./types.js";

export function locationFromIndex(source: string, index: number): SourceLocation {
  let line = 1;
  let column = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (source[offset] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { index, line, column };
}
