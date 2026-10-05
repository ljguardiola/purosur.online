import { isInternalBarcode } from "@purosur/domain";
import { z } from "zod";

export const internalBarcodeSchema = z.object({
  code: z.string().refine(isInternalBarcode),
});

export type InternalBarcode = z.output<typeof internalBarcodeSchema>;
