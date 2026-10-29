import { ISSUED_AUTHORIZATION_KINDS, ISSUED_DOCUMENT_KINDS } from "@purosur/domain";
import { z } from "zod";
import {
  answeredRangeSchema,
  pointOfSaleNumberSchema,
  reportQuerySchema,
} from "../shared/index.js";

const count = z.int().nonnegative();
const cents = z.int();

export const issuedFiscalDocumentsReportQuerySchema = reportQuerySchema;

const row = z.object({
  kind: z.enum(ISSUED_DOCUMENT_KINDS),
  voucher_type: z.int().positive(),
  point_of_sale: pointOfSaleNumberSchema,
  authorization_kind: z.enum(ISSUED_AUTHORIZATION_KINDS),
  count,
  amount: cents,
});

const countAndAmount = z.object({ count, amount: cents });

export const issuedFiscalDocumentsReportSchema = z.object({
  range: answeredRangeSchema,
  rows: z.array(row),
  totals: z.object({
    receipts: countAndAmount,
    credit_notes: countAndAmount,
    amount: cents,
    contingency: z.object({ count, share_tenths_of_percent: z.int().nullable() }),
  }),
});

export type IssuedFiscalDocumentsReportQuery = z.output<
  typeof issuedFiscalDocumentsReportQuerySchema
>;
export type IssuedFiscalDocumentsReportBody = z.output<typeof issuedFiscalDocumentsReportSchema>;
