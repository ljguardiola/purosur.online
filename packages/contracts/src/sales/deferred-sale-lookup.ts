import { deferredSaleReferenceFromQrText, isShortCode } from "@purosur/domain";
import { z } from "zod";
import { requestIdSchema } from "../shared/index.js";
import { receiptCopySchema } from "./sales-history.js";

const SHORT_CODE_MESSAGE = "code must be a deferred sale's short code";
const QR_MESSAGE = "text must be a deferred sale's QR";

const typedReadingSchema = z
  .object({
    kind: z.literal("typed"),
    code: z
      .string({ error: SHORT_CODE_MESSAGE })
      .transform((code) => code.replace(/[\s-]/g, "").toUpperCase())
      .refine(isShortCode, SHORT_CODE_MESSAGE),
  })
  .transform(({ code }) => ({ kind: "short_code" as const, shortCode: code }));

const scannedReadingSchema = z
  .object({
    kind: z.literal("scanned"),
    text: z.string({ error: QR_MESSAGE }).transform((text, context) => {
      const reference = deferredSaleReferenceFromQrText(text);
      if (reference === null) {
        context.addIssue({ code: "custom", message: QR_MESSAGE });
        return z.NEVER;
      }
      return reference;
    }),
  })
  .transform(({ text }) => ({ kind: "reference" as const, ...text }));

export const findDeferredSaleMessageSchema = z.object({
  type: z.literal("find-deferred-sale"),
  request_id: requestIdSchema,
  reading: z.union([typedReadingSchema, scannedReadingSchema]),
});

export const printDeferredSaleInvoiceMessageSchema = z.object({
  type: z.literal("print-deferred-sale-invoice"),
  request_id: requestIdSchema,
  sale_id: z.string(),
});

const findDeferredSaleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("found"),
    sale_id: z.string(),
    occurred_at: z.iso.datetime({ offset: true }),
    total: z.int().nonnegative(),
    short_code: z.string(),
    invoice: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("pending") }),
      z.object({
        kind: z.literal("issued"),
        point_of_sale: z.int().positive(),
        number: z.int().positive(),
      }),
    ]),
    original_printed: z.boolean(),
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("voided") }),
  z.object({ kind: z.literal("expired") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("lacks_permission") }),
]);
export type FindDeferredSaleOutcome = z.infer<typeof findDeferredSaleOutcomeSchema>;

const printDeferredSaleInvoiceOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("started"), copy: receiptCopySchema }),
  z.object({ kind: z.literal("busy") }),
  z.object({ kind: z.literal("already_printed") }),
  z.object({ kind: z.literal("printer_not_configured") }),
  z.object({ kind: z.literal("sale_voided") }),
  z.object({ kind: z.literal("voided") }),
  z.object({ kind: z.literal("expired") }),
  z.object({ kind: z.literal("not_found") }),
  z.object({
    kind: z.literal("not_yet"),
    cause: z.enum(["cannot_authorize", "older_sale_blocking"]),
  }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("lacks_permission") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type PrintDeferredSaleInvoiceOutcome = z.infer<typeof printDeferredSaleInvoiceOutcomeSchema>;

export const findDeferredSaleResultMessageSchema = z.object({
  type: z.literal("find-deferred-sale-result"),
  request_id: requestIdSchema,
  outcome: findDeferredSaleOutcomeSchema,
});

export const printDeferredSaleInvoiceResultMessageSchema = z.object({
  type: z.literal("print-deferred-sale-invoice-result"),
  request_id: requestIdSchema,
  outcome: printDeferredSaleInvoiceOutcomeSchema,
});
