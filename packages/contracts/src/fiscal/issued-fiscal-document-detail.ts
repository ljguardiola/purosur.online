import {
  BUYER_DOCUMENT_KINDS,
  PAYMENT_METHODS,
  POINT_CARD_TYPES,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";
import { issuedFiscalDocumentSchema } from "./issued-fiscal-documents.js";
import { issuedFiscalDocumentsQueryNumberSchema } from "./issued-fiscal-documents-query-number.js";

export const issuedFiscalDocumentPathSchema = z.object({
  voucher_type: issuedFiscalDocumentsQueryNumberSchema,
  point_of_sale: issuedFiscalDocumentsQueryNumberSchema.pipe(pointOfSaleNumberSchema),
  number: issuedFiscalDocumentsQueryNumberSchema,
});

export type IssuedFiscalDocumentPath = z.output<typeof issuedFiscalDocumentPathSchema>;

const buyerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("final_consumer") }),
  z.object({
    kind: z.literal("identified"),
    document_kind: z.enum(BUYER_DOCUMENT_KINDS),
    document_number: z.int().nonnegative(),
  }),
]);

const lineSchema = z.object({
  product_name: z.string(),
  sale_unit: z.enum(SALE_UNITS),
  quantity: z.int().positive(),
  promotion: z.object({ name: z.string() }).nullable(),
  amount: z.int().nonnegative(),
});

const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  card_type: z.enum(POINT_CARD_TYPES).nullable(),
  amount: z.int().positive(),
});

export const issuedFiscalDocumentDetailSchema = issuedFiscalDocumentSchema.extend({
  buyer: buyerSchema,
  lines: z.array(lineSchema),
  payments: z.array(paymentSchema),
  credit_notes: z.array(issuedFiscalDocumentSchema),
});

export type IssuedFiscalDocumentDetailBody = z.output<typeof issuedFiscalDocumentDetailSchema>;
