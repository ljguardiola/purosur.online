import { MAX_UNIT_PRICE_CENTS } from "@purosur/contracts";
import { formatNumber } from "@purosur/ui";
import { parseEsArNumber } from "../platform/es-ar-number";

export { MAX_UNIT_PRICE_CENTS };

export function formatCents(cents: number): string {
  return `$ ${formatNumber(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ParsedAmount =
  | { kind: "ok"; cents: number }
  | { kind: "malformed" }
  | { kind: "notPositive" }
  | { kind: "tooLarge" };

export function parseAmountInput(value: string): ParsedAmount {
  const digits = parseEsArNumber(value, 2);
  if (!digits) {
    return { kind: "malformed" };
  }
  const cents = Number(digits.whole) * 100 + Number(digits.fraction.padEnd(2, "0"));
  if (cents <= 0) {
    return { kind: "notPositive" };
  }
  if (cents > MAX_UNIT_PRICE_CENTS) {
    return { kind: "tooLarge" };
  }
  return { kind: "ok", cents };
}
