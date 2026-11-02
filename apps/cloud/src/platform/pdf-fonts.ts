import { readFileSync } from "node:fs";

// pdfkit's built-in Helvetica-Bold only encodes WinAnsi, silently garbling any other character
// (Greek, Cyrillic, "ő", "≈"); Liberation Sans Bold is metric-compatible with it and covers them.
export const BOLD_FONT = "LiberationSans-Bold";
export const BOLD_FONT_FILE = readFileSync(
  // `fonts/` sits beside both `src/` and `dist/` and ships through package.json's `files`.
  new URL("../../fonts/LiberationSans-Bold.ttf", import.meta.url),
);
