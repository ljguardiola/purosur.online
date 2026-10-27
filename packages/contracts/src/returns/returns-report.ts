import { ARGENTINA_TIME_ZONE, RETURN_DISPOSITIONS, RETURN_REASONS } from "@purosur/domain";
import { z } from "zod";
import {
  answeredRangeSchema,
  pointOfSaleNumberSchema,
  reportQuerySchema,
} from "../shared/index.js";

const count = z.int().nonnegative();
const cents = z.int().nonnegative();
const person = z.object({ id: z.string().min(1), name: z.string().nullable() });

export const returnsReportQuerySchema = reportQuerySchema;

const line = z.object({
  sale_line_id: z.string().min(1),
  product_name: z.string(),
  quantity: z.int().positive(),
  reason: z.enum(RETURN_REASONS),
  disposition: z.enum(RETURN_DISPOSITIONS),
  refunded: cents,
});

const row = z.object({
  return_id: z.string().min(1),
  occurred_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  register: z.object({ id: z.string().min(1), name: z.string() }),
  sale: z.object({
    id: z.string().min(1),
    operation_number: z.int().positive().nullable(),
    invoice: z
      .object({ point_of_sale: pointOfSaleNumberSchema, number: z.int().positive() })
      .nullable(),
  }),
  cashier: person,
  authorizer: person.nullable(),
  lines: z.array(line),
  refunded: cents,
});

const group = z.object({
  rows: z.array(row),
  totals: z.object({ returns: count, refunded: cents }),
});

export const returnsReportSchema = z.object({
  range: answeredRangeSchema,
  typed: group,
  scanned: group,
});

export type ReturnsReportQuery = z.output<typeof returnsReportQuerySchema>;
export type ReturnsReportBody = z.output<typeof returnsReportSchema>;
