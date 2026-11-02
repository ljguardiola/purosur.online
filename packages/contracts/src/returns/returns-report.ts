import {
  ARGENTINA_TIME_ZONE,
  RETURN_DISPOSITIONS,
  RETURN_REASONS,
  RETURN_RESOLUTIONS,
  SALE_UNITS,
} from "@purosur/domain";
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
  sale_unit: z.enum(SALE_UNITS),
  quantity: z.int().positive(),
  reason: z.enum(RETURN_REASONS),
  disposition: z.enum(RETURN_DISPOSITIONS),
  resolution: z.enum(RETURN_RESOLUTIONS),
  refunded: cents,
});

const register = z.object({ id: z.string().min(1), name: z.string() });

const sale = z.object({
  id: z.string().min(1),
  operation_number: z.int().positive().nullable(),
  invoice: z
    .object({ point_of_sale: pointOfSaleNumberSchema, number: z.int().positive() })
    .nullable(),
});

const row = z.object({
  return_id: z.string().min(1),
  occurred_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  register,
  sale,
  cashier: person,
  authorizer: person.nullable(),
  lines: z.array(line),
  refunded: cents,
});

const group = z.object({
  rows: z.array(row),
  totals: z.object({ returns: count, refunded: cents }),
});

const voidRow = z.object({
  sale,
  voided_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  register,
  cashier: person,
  authorizer: person.nullable(),
  total: cents,
});

const summary = {
  voids: count,
  voided: cents,
  returns: count,
  refunded: cents,
  refunded_lines: count,
  exchanged_lines: count,
  typed_returns: count,
};

export const returnsReportSchema = z.object({
  range: answeredRangeSchema,
  typed: group,
  scanned: group,
  voids: z.object({
    rows: z.array(voidRow),
    totals: z.object({ voids: count, voided: cents }),
  }),
  totals: z.object(summary),
  by_cashier: z.array(z.object({ cashier: person, ...summary })),
  by_authorizer: z.array(z.object({ authorizer: person.nullable(), ...summary })),
});

export type ReturnsReportQuery = z.output<typeof returnsReportQuerySchema>;
export type ReturnsReportBody = z.output<typeof returnsReportSchema>;
