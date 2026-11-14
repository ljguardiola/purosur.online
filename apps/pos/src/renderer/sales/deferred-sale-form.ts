import { findDeferredSaleMessageSchema } from "@purosur/contracts";
import type { DeferredSaleReading } from "../platform/core-client";

const deferredSaleFormRequestSchema = findDeferredSaleMessageSchema.omit({
  type: true,
  request_id: true,
});

export function scannedDeferredSaleReading(text: string): DeferredSaleReading | undefined {
  const reading: DeferredSaleReading = { kind: "scanned", text };
  return deferredSaleFormRequestSchema.safeParse({ reading }).success ? reading : undefined;
}
