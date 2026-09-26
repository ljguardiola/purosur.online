import {
  isValidNetContentQuantity,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
} from "@purosur/contracts";
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

export type NetContentQuantityMessages = {
  netContentQuantityInvalid: string;
  netContentQuantityTooLarge: string;
};

/** Mirrors the server's own validateProductFields: a blank quantity is never an error (it clears
 * the field instead), an unparsable or non-positive one gets the format message, and one over the
 * shared cap gets its own friendlier message instead of the format one. */
export function netContentQuantityError(
  quantity: string,
  messages: NetContentQuantityMessages,
): string | undefined {
  const trimmed = quantity.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = parseNetContentQuantity(trimmed);
  if (parsed === undefined) {
    return messages.netContentQuantityInvalid;
  }
  if (parsed > NET_CONTENT_QUANTITY_MAX) {
    return messages.netContentQuantityTooLarge;
  }
  return isValidNetContentQuantity(parsed) ? undefined : messages.netContentQuantityInvalid;
}
