import { findDeferredSaleMessageSchema } from "@purosur/contracts";
import type { DeferredSaleReading } from "../platform/core-client";

const deferredSaleReadingSchema = findDeferredSaleMessageSchema.shape.reading;

export function scannedDeferredSaleReading(text: string): DeferredSaleReading | undefined {
  const reading: DeferredSaleReading = { kind: "scanned", text };
  return deferredSaleReadingSchema.safeParse(reading).success ? reading : undefined;
}
