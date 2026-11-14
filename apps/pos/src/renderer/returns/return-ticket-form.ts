import { findSaleForReturnMessageSchema } from "@purosur/contracts";
import { parsePointOfSaleNumber } from "@purosur/ui";
import { z } from "zod";
import type { SaleForReturnReading } from "../platform/core-client";

const typedReadingSchema = findSaleForReturnMessageSchema.shape.reading.options[0];

export const returnTicketRequestSchema = z.object({ reading: typedReadingSchema });

export type ReturnTicketFormValues = { search: string };

export const EMPTY_RETURN_TICKET_FORM: ReturnTicketFormValues = { search: "" };

export const RETURN_TICKET_FIELDS = {
  reading: null,
  "reading.point_of_sale": "search",
  "reading.number": "search",
} as const;

const TYPED_NUMBER_PATTERN = /^(\d+)-(\d+)$/;

export function returnTicketRequestFrom({ search }: ReturnTicketFormValues): {
  reading: { kind: "typed"; point_of_sale: number; number: number };
} {
  const match = TYPED_NUMBER_PATTERN.exec(search.trim());
  return {
    reading: {
      kind: "typed",
      point_of_sale: match === null ? Number.NaN : parsePointOfSaleNumber(match[1] ?? ""),
      number: match === null ? Number.NaN : parsePointOfSaleNumber(match[2] ?? ""),
    },
  };
}

export function scannedReturnReading(text: string): SaleForReturnReading | undefined {
  const reading: SaleForReturnReading = { kind: "scanned", text };
  return findSaleForReturnMessageSchema.shape.reading.safeParse(reading).success
    ? reading
    : undefined;
}
