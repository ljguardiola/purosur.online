import { MAX_UNIT_PRICE_CENTS } from "@purosur/domain";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";

export interface PriceFieldValidationFailure {
  field: "unitPrice" | "expectedCurrentPriceId";
  message: string;
}

export function readUnitPrice(body: unknown): number | undefined {
  const raw = (body as { unitPrice?: unknown } | undefined)?.unitPrice;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 && raw <= MAX_UNIT_PRICE_CENTS
    ? raw
    : undefined;
}

// `null` means the product has no price yet, distinct from an invalid id (`undefined`).
export function readExpectedCurrentPriceId(body: unknown): string | null | undefined {
  const raw = (body as { expectedCurrentPriceId?: unknown } | undefined)?.expectedCurrentPriceId;
  if (raw === null) {
    return null;
  }
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

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
