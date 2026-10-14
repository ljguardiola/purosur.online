import { ARGENTINA_TIME_ZONE } from "../../shared/index.js";

const CLOCK_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function generationStampOf(generatedAt: Date): string {
  return CLOCK_FORMAT.formatToParts(generatedAt)
    .filter(({ type }) => type !== "literal")
    .map(({ value }) => value)
    .join("");
}
