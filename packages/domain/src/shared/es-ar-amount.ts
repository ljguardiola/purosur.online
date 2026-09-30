import { parseEsArNumber } from "./es-ar-number.js";

export function parseAmountCents(value: string): number | undefined {
  const digits = parseEsArNumber(value, 2);
  if (!digits) {
    return undefined;
  }
  return Number(digits.whole) * 100 + Number(digits.fraction.padEnd(2, "0"));
}
