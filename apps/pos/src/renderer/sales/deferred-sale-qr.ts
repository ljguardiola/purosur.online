import { findDeferredSaleMessageSchema } from "@purosur/contracts";
import type { DeferredSaleReading } from "../platform/core-client";

const deferredSaleReadingSchema = findDeferredSaleMessageSchema.shape.reading;

export type ScannedDeferredSaleReading = Extract<DeferredSaleReading, { kind: "scanned" }>;

export function scannedDeferredSaleReading(text: string): ScannedDeferredSaleReading | undefined {
  const reading: ScannedDeferredSaleReading = { kind: "scanned", text };
  return deferredSaleReadingSchema.safeParse(reading).success ? reading : undefined;
}
