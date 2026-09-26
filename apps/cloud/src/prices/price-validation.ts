import { MAX_UNIT_PRICE_CENTS } from "@purosur/contracts";
import { UUID_PATTERN } from "../db/uuid-pattern.js";

export interface PriceFieldValidationFailure {
  field: "unitPrice" | "expectedCurrentPriceId";
  message: string;
}

/** A positive integer number of cents per unit or per kilogram; anything else is rejected. */
export function readUnitPrice(body: unknown): number | undefined {
  const raw = (body as { unitPrice?: unknown } | undefined)?.unitPrice;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 && raw <= MAX_UNIT_PRICE_CENTS
    ? raw
    : undefined;
}

/**
 * The price id the caller saw as current when they submitted the change: `null` reads as "the
 * product had no price yet", a well-formed id reads as that price, and anything else is a
 * validation failure. Used by `POST /products/:id/price`, where a product can be priced for the
 * first time.
 */
export function readExpectedCurrentPriceId(body: unknown): string | null | undefined {
  const raw = (body as { expectedCurrentPriceId?: unknown } | undefined)?.expectedCurrentPriceId;
  if (raw === null) {
    return null;
  }
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

/**
 * The price id the caller is confirming: unlike `readExpectedCurrentPriceId`, `null` is not a
 * valid answer here, since a product with no price yet has nothing to confirm. Used by
 * `POST /products/:id/price-confirmation`.
 */
export function readRequiredExpectedCurrentPriceId(body: unknown): string | undefined {
  const raw = (body as { expectedCurrentPriceId?: unknown } | undefined)?.expectedCurrentPriceId;
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

export function validateSetPriceFields(input: {
  unitPrice: number | undefined;
  expectedCurrentPriceId: string | null | undefined;
}): PriceFieldValidationFailure | undefined {
  if (input.unitPrice === undefined) {
    return { field: "unitPrice", message: "unitPrice must be a positive integer number of cents" };
  }
  if (input.expectedCurrentPriceId === undefined) {
    return {
      field: "expectedCurrentPriceId",
      message: "expectedCurrentPriceId must be an existing price's id, or null",
    };
  }
  return undefined;
}

export function validateConfirmationFields(input: {
  expectedCurrentPriceId: string | undefined;
}): PriceFieldValidationFailure | undefined {
  if (input.expectedCurrentPriceId === undefined) {
    return {
      field: "expectedCurrentPriceId",
      message: "expectedCurrentPriceId must be an existing price's id",
    };
  }
  return undefined;
}
