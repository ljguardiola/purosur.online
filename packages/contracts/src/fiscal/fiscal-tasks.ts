import {
  ALERT_LEVELS,
  ARGENTINA_TIME_ZONE,
  CREDIT_NOTE_C_DOCUMENT_TYPE,
  FACTURA_C_DOCUMENT_TYPE,
  type FISCAL_TASK_KINDS,
  isCalendarDay,
  isShortCode,
} from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema, recordIdSchema } from "../shared/index.js";

const instantSchema = z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE });
const centsSchema = z.int().nonnegative();

const taskBase = {
  id: recordIdSchema(),
  register_id: z.string(),
  register_name: z.string(),
  created_at: instantSchema,
  open_for_seconds: z.int().nonnegative(),
  alert: z
    .object({ level: z.enum(ALERT_LEVELS), escalated_at: instantSchema.nullable() })
    .nullable(),
};

const externalInvoicingTaskSchema = z.object({
  ...taskBase,
  kind: z.literal("external_invoicing" satisfies (typeof FISCAL_TASK_KINDS)[number]),
  point_of_sale: pointOfSaleNumberSchema,
  document_type: z.enum([FACTURA_C_DOCUMENT_TYPE, CREDIT_NOTE_C_DOCUMENT_TYPE]),
  number: z.int().positive(),
  voucher: z.object({
    issued_on: z.string().refine(isCalendarDay),
    total: centsSchema,
    authorization_code: z.string(),
  }),
});

const creditNoteRejectedTaskSchema = z.object({
  ...taskBase,
  kind: z.literal("credit_note_rejected" satisfies (typeof FISCAL_TASK_KINDS)[number]),
  point_of_sale: pointOfSaleNumberSchema,
  number: z.int().positive(),
  credit_note_id: z.string(),
  rejections: z.array(z.object({ code: z.int(), message: z.string() })),
});

const deferredSaleExpiredTaskSchema = z.object({
  ...taskBase,
  kind: z.literal("deferred_sale_expired" satisfies (typeof FISCAL_TASK_KINDS)[number]),
  sale_occurred_at: instantSchema,
  total: centsSchema,
  short_code: z.string().refine(isShortCode),
});

export const fiscalTaskItemSchema = z.discriminatedUnion("kind", [
  externalInvoicingTaskSchema,
  creditNoteRejectedTaskSchema,
  deferredSaleExpiredTaskSchema,
]);

export const fiscalTasksSchema = z.object({ tasks: z.array(fiscalTaskItemSchema) });

export type FiscalTaskItem = z.output<typeof fiscalTaskItemSchema>;
export type FiscalTasks = z.output<typeof fiscalTasksSchema>;
