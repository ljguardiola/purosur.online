import {
  ARGENTINA_TIME_ZONE,
  ISSUED_DOCUMENT_KINDS,
  ISSUED_DOCUMENT_STATES,
  isCalendarDay,
  isReportPeriodAsked,
} from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema, pointOfSaleNumberSchema, recordIdSchema } from "../shared/index.js";
import { issuedFiscalDocumentsQueryNumberSchema } from "./issued-fiscal-documents-query-number.js";

const calendarDay = z.string().refine(isCalendarDay);

export const issuedFiscalDocumentsQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    register_id: recordIdSchema().optional(),
    kind: z.enum(ISSUED_DOCUMENT_KINDS).optional(),
    number: issuedFiscalDocumentsQueryNumberSchema.optional(),
    page: issuedFiscalDocumentsQueryNumberSchema.optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type IssuedFiscalDocumentsQuery = z.output<typeof issuedFiscalDocumentsQuerySchema>;

const voucherSchema = z.object({
  voucher_type: z.int().positive(),
  point_of_sale: pointOfSaleNumberSchema,
  number: z.int().positive(),
});

const authorizationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cae"), code: z.string().min(1), due_on: calendarDay }),
  z.object({
    kind: z.literal("caea"),
    code: z.string().min(1),
    fortnight_start: calendarDay,
    fortnight_end: calendarDay,
  }),
]);

export const issuedFiscalDocumentSchema = voucherSchema.extend({
  kind: z.enum(ISSUED_DOCUMENT_KINDS),
  issued_on: calendarDay,
  issued_at: z.iso.datetime({ offset: true }).meta({ timeZone: ARGENTINA_TIME_ZONE }),
  register: z.object({ id: recordIdSchema(), name: z.string() }),
  authorization: authorizationSchema.nullable(),
  state: z.enum(ISSUED_DOCUMENT_STATES),
  contingency: z.boolean(),
  total: z.int().nonnegative(),
  corrected_voucher: voucherSchema.nullable(),
});

export const issuedFiscalDocumentsSchema = z.object({
  range: answeredRangeSchema,
  documents: z.array(issuedFiscalDocumentSchema),
  total: z.int().nonnegative(),
  page_size: z.int().positive(),
});

export type IssuedFiscalDocumentsBody = z.output<typeof issuedFiscalDocumentsSchema>;
