import { isInternalBarcode, mayGenerateInternalBarcodeFor } from "@purosur/domain";
import { z } from "zod";

export const internalBarcodeSchema = z.object({
  code: z.string().refine(isInternalBarcode),
});

export type InternalBarcode = z.output<typeof internalBarcodeSchema>;

export const internalBarcodeGenerationBodySchema = z.object({
  barcodes: z
    .array(z.string())
    .refine(
      mayGenerateInternalBarcodeFor,
      "an internal barcode is only generated for a product with no barcode",
    ),
});

export type InternalBarcodeGenerationBody = z.input<typeof internalBarcodeGenerationBodySchema>;
