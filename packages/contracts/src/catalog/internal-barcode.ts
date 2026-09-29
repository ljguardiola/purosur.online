import { z } from "zod";

export const internalBarcodeSchema = z.object({ code: z.string() });

export type InternalBarcode = z.output<typeof internalBarcodeSchema>;
