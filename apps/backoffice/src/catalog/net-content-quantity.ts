import { netContentQuantitySchema } from "@purosur/contracts";
import { formatNumber, parseEsArNumber } from "@purosur/ui";
import { schemaLimit } from "../platform/schema-limit";

const MAX_QUANTITY = schemaLimit(netContentQuantitySchema.meta()?.["maxValue"]);
const MAX_DECIMALS = schemaLimit(netContentQuantitySchema.meta()?.["maxDecimals"]);

export function parseNetContentQuantity(value: string): number | undefined {
  const digits = parseEsArNumber(value, MAX_DECIMALS);
  if (!digits) {
    return undefined;
  }
  return Number(digits.fraction ? `${digits.whole}.${digits.fraction}` : digits.whole);
}

/** A quantity's own string form for prefilling an edit modal: a decimal comma and no thousands
 * separator, a form `parseNetContentQuantity` reads back to the same number. */
export function formatNetContentQuantity(quantity: number): string {
  return String(quantity).replace(".", ",");
}

export const NET_CONTENT_QUANTITY_INVALID = `Ingresá una cantidad mayor que cero, de hasta ${formatNumber(MAX_QUANTITY)} y con hasta ${formatNumber(MAX_DECIMALS)} decimales.`;
