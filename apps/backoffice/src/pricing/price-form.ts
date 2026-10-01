import { type PriceSetBody, priceSetBodySchema } from "@purosur/contracts";
import { formatCents, parseAmountCents } from "@purosur/ui";
import { schemaLimit } from "./schema-limit";

const UNIT_PRICE_SCHEMA = priceSetBodySchema.shape.unitPrice;
const AMOUNT_REQUIRED = "Ingresá el precio nuevo.";
const AMOUNT_MALFORMED = "Escribí el precio con coma para los decimales, por ejemplo 7.500,50.";
const AMOUNT_OUT_OF_RANGE = `Ingresá un precio mayor a cero, de hasta ${formatCents(schemaLimit(UNIT_PRICE_SCHEMA.maxValue))}.`;
const AMOUNT_REVIEW = "Revisá el precio.";
export const AMOUNT_UNCHANGED = "Es el precio actual: confirmalo sin cambios en vez de guardarlo.";

export type PriceFormValues = { amount: string; expectedCurrentPriceId: string | null };

export const EMPTY_PRICE_FORM: PriceFormValues = { amount: "", expectedCurrentPriceId: null };

export function priceRequestFrom({
  amount,
  expectedCurrentPriceId,
}: PriceFormValues): PriceSetBody {
  return {
    unitPrice: parseAmountCents(amount) ?? Number.NaN,
    expectedCurrentPriceId,
  };
}

export function amountMessage({ amount }: PriceFormValues): string {
  if (amount.trim() === "") {
    return AMOUNT_REQUIRED;
  }
  const cents = parseAmountCents(amount);
  if (cents === undefined) {
    return AMOUNT_MALFORMED;
  }
  return UNIT_PRICE_SCHEMA.safeParse(cents).success ? AMOUNT_REVIEW : AMOUNT_OUT_OF_RANGE;
}
