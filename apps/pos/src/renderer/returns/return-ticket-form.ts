import { findSaleForReturnMessageSchema } from "@purosur/contracts";
import { parsePointOfSaleNumber } from "@purosur/ui";
import { z } from "zod";
import type { SaleForReturnReading } from "../platform/core-client";

const typedReadingSchema = findSaleForReturnMessageSchema.shape.reading.options[0];

export const returnTicketRequestSchema = z.object({ reading: typedReadingSchema });

export type ReturnTicketFormValues = { pointOfSale: string; number: string };

export const EMPTY_RETURN_TICKET_FORM: ReturnTicketFormValues = { pointOfSale: "", number: "" };

export const INVALID_POINT_OF_SALE_MESSAGE = "Tipeá el punto de venta impreso, como 00003.";

export const INVALID_INVOICE_NUMBER_MESSAGE =
  "Tipeá el número de comprobante impreso, como 00001192.";

export function returnTicketRequestFrom({ pointOfSale, number }: ReturnTicketFormValues): {
  reading: { kind: "typed"; point_of_sale: number; number: number };
} {
  return {
    reading: {
      kind: "typed",
      point_of_sale: parsePointOfSaleNumber(pointOfSale),
      number: parsePointOfSaleNumber(number),
    },
  };
}

export function scannedReturnReading(text: string): SaleForReturnReading | undefined {
  const reading: SaleForReturnReading = { kind: "scanned", text };
  return findSaleForReturnMessageSchema.shape.reading.safeParse(reading).success
    ? reading
    : undefined;
}
