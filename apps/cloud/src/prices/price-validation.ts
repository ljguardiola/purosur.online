import { MAX_UNIT_PRICE_CENTS } from "@purosur/contracts";
import { UUID_PATTERN } from "../db/uuid-pattern.js";

export interface PriceFieldValidationFailure {
  field: "unitPrice" | "expectedCurrentPriceId";
  message: string;
}

// Cents per unit or per kilogram, depending on the product's own sale unit.
export function readUnitPrice(body: unknown): number | undefined {
  const raw = (body as { unitPrice?: unknown } | undefined)?.unitPrice;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 && raw <= MAX_UNIT_PRICE_CENTS
    ? raw
    : undefined;
}

// `null` reads as "the product had no price yet"; a well-formed id reads as that price; anything
// else is a validation failure.
export function readExpectedCurrentPriceId(body: unknown): string | null | undefined {
  const raw = (body as { expectedCurrentPriceId?: unknown } | undefined)?.expectedCurrentPriceId;
  if (raw === null) {
    return null;
  }
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

// Unlike `readExpectedCurrentPriceId`, `null` is not valid here: a product with no price yet has
// nothing to confirm.
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
