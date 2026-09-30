import {
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  parseEsArNumber,
} from "@purosur/domain";
import { formatNumber } from "@purosur/ui";

export function parseNetContentQuantity(value: string): number | undefined {
  const digits = parseEsArNumber(value, NET_CONTENT_QUANTITY_MAX_DECIMALS);
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

export const NET_CONTENT_QUANTITY_INVALID = `Ingresá una cantidad mayor que cero, de hasta ${formatNumber(NET_CONTENT_QUANTITY_MAX)} y con hasta ${formatNumber(NET_CONTENT_QUANTITY_MAX_DECIMALS)} decimales.`;
