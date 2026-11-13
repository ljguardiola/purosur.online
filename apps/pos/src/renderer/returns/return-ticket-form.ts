import { findSaleForReturnMessageSchema } from "@purosur/contracts";
import { parsePointOfSaleNumber } from "@purosur/ui";
import type { SaleForReturnReading } from "../platform/core-client";

const typedReadingSchema = findSaleForReturnMessageSchema.shape.reading.options[0];

const TYPED_NUMBER_PATTERN = /^(\d+)-(\d+)$/;

export function typedReturnReading(text: string): SaleForReturnReading | undefined {
  const match = TYPED_NUMBER_PATTERN.exec(text.trim());
  if (match === null) {
    return undefined;
  }
  const reading: SaleForReturnReading = {
    kind: "typed",
    point_of_sale: parsePointOfSaleNumber(match[1] ?? ""),
    number: parsePointOfSaleNumber(match[2] ?? ""),
  };
  return typedReadingSchema.safeParse(reading).success ? reading : undefined;
}

export function scannedReturnReading(text: string): SaleForReturnReading | undefined {
  const reading: SaleForReturnReading = { kind: "scanned", text };
  return findSaleForReturnMessageSchema.shape.reading.safeParse(reading).success
    ? reading
    : undefined;
}
