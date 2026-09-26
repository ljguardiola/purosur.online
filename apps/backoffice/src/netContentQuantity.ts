import {
  isValidNetContentQuantity,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
} from "@purosur/contracts";

// Argentine format: the comma is the only decimal separator, and a dot only groups thousands, in
// valid 3-digit groups ("1.000", "12.345,5", "1.000.000"). A dot anywhere else ("1.5", "1.00",
// ".5") fails this format check before the value or its decimals are looked at, which is what
// keeps "1.000" from being misread as 1 the way a locale-agnostic decimal dot would read it. The
// first group can't start with a zero either ("0.500", "00.500"): a real thousands group never
// does, and a leading zero there is the same 1000x misreading as "1.000" for "1000 g".
const NET_CONTENT_QUANTITY_PATTERN = new RegExp(
  `^(\\d+|[1-9]\\d{0,2}(\\.\\d{3})+)(,\\d{1,${NET_CONTENT_QUANTITY_MAX_DECIMALS}})?$`,
);

export function parseNetContentQuantity(value: string): number | undefined {
  const trimmed = value.trim();
  if (!NET_CONTENT_QUANTITY_PATTERN.test(trimmed)) {
    return undefined;
  }
  return Number(trimmed.replaceAll(".", "").replace(",", "."));
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
