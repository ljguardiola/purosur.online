import { z } from "zod";

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
