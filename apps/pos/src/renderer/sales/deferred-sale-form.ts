import { findDeferredSaleMessageSchema } from "@purosur/contracts";
import type { DeferredSaleReading } from "../platform/core-client";

export const deferredSaleFormRequestSchema = findDeferredSaleMessageSchema.omit({
  type: true,
  request_id: true,
});

export type DeferredSaleFormValues = { code: string };

export const EMPTY_DEFERRED_SALE_FORM: DeferredSaleFormValues = { code: "" };

export const INVALID_SHORT_CODE_MESSAGE = "El código tiene 8 letras y números, como 7KQ4-M2P9.";

export function deferredSaleRequestFrom({ code }: DeferredSaleFormValues): {
  reading: DeferredSaleReading;
} {
  return { reading: { kind: "typed", code } };
}

export function scannedDeferredSaleReading(text: string): DeferredSaleReading | undefined {
  const reading: DeferredSaleReading = { kind: "scanned", text };
  return deferredSaleFormRequestSchema.safeParse({ reading }).success ? reading : undefined;
}
