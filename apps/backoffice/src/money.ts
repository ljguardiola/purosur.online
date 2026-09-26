import { parseEsArNumber } from "./esArNumber";

const AMOUNT_FORMAT = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number): string {
  return `$ ${AMOUNT_FORMAT.format(cents / 100)}`;
}

// The cloud stores a unit price as a Postgres `integer` number of cents.
export const MAX_UNIT_PRICE_CENTS = 2_147_483_647;

export type ParsedAmount =
  | { kind: "ok"; cents: number }
  | { kind: "malformed" }
  | { kind: "notPositive" }
  | { kind: "tooLarge" };

/** Parses what a person typed as a peso amount (e.g. "7.500,50", "7500,5", "7500") into cents. */
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
