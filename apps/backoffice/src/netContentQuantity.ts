import {
  isValidNetContentQuantity,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
} from "@purosur/contracts";
import { formatNumber } from "@purosur/ui";
import { parseEsArNumber } from "./esArNumber";

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

// Also the message for the backend's `netContentQuantity` validation failure, which never
// distinguishes an invalid format from a too-large one.
export const NET_CONTENT_QUANTITY_INVALID = `Ingresá una cantidad mayor que cero, con hasta ${formatNumber(NET_CONTENT_QUANTITY_MAX_DECIMALS)} decimales.`;
const NET_CONTENT_QUANTITY_TOO_LARGE = `Ingresá una cantidad de hasta ${formatNumber(NET_CONTENT_QUANTITY_MAX)}.`;

export function netContentQuantityError(quantity: string): string | undefined {
  const trimmed = quantity.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = parseNetContentQuantity(trimmed);
  if (parsed === undefined) {
    return NET_CONTENT_QUANTITY_INVALID;
  }
  if (parsed > NET_CONTENT_QUANTITY_MAX) {
    return NET_CONTENT_QUANTITY_TOO_LARGE;
  }
  return isValidNetContentQuantity(parsed) ? undefined : NET_CONTENT_QUANTITY_INVALID;
}
