import { z } from "zod";
import { labelSheetBodySchema } from "./label-sheet.js";

// The NIIMBOT B31 prints at most 70 mm wide, and below 25 mm an EAN-13 no longer fits with the
// thinnest bars the store's reader reads.
export const LABEL_PRINTER_WIDTH_MM = { min: 25, max: 70 } as const;
export const LABEL_PRINTER_HEIGHT_MM = { min: 15, max: 70 } as const;

function millimetresSchema(field: string, range: { min: number; max: number }) {
  const message = `${field} must be a whole number of millimetres from ${range.min} to ${range.max}`;
  return z
    .number({ error: message })
    .int({ error: message })
    .min(range.min, { error: message })
    .max(range.max, { error: message });
}

export const printerLabelSizeSchema = z.object({
  widthMm: millimetresSchema("widthMm", LABEL_PRINTER_WIDTH_MM),
  heightMm: millimetresSchema("heightMm", LABEL_PRINTER_HEIGHT_MM),
});

export type PrinterLabelSize = z.infer<typeof printerLabelSizeSchema>;

export const labelPrintsBodySchema = labelSheetBodySchema.extend({
  size: printerLabelSizeSchema,
});

export type LabelPrintsBody = z.input<typeof labelPrintsBodySchema>;

const BITS_PER_BYTE = 8;

function decodedByteCount(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

export const printerLabelsSchema = z
  .object({
    widthDots: z
      .number()
      .int()
      .positive()
      .refine((widthDots) => widthDots % BITS_PER_BYTE === 0, {
        message: "widthDots must be a multiple of 8",
      }),
    heightDots: z.number().int().positive(),
    labels: z.array(
      z.object({
        copies: z.number().int().min(1),
        rows: z.base64(),
      }),
    ),
  })
  .superRefine((printerLabels, context) => {
    const expectedBytes = (printerLabels.widthDots / BITS_PER_BYTE) * printerLabels.heightDots;
    printerLabels.labels.forEach((label, index) => {
      if (decodedByteCount(label.rows) !== expectedBytes) {
        context.addIssue({
          code: "custom",
          path: ["labels", index, "rows"],
          message: "rows must hold widthDots / 8 bytes for each of heightDots rows",
        });
      }
    });
  });

export type PrinterLabels = z.infer<typeof printerLabelsSchema>;
