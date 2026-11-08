import {
  ARGENTINA_TIME_ZONE,
  CHARGE_COST_METHODS,
  isCalendarDay,
  isReportPeriodAsked,
  MERCADO_PAGO_PAYMENT_METHODS,
} from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema, recordIdSchema } from "../shared/index.js";

const count = z.int().nonnegative();
const signedCents = z.int();
const instant = z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE });
const calendarDay = z.string().refine(isCalendarDay);
const calendarMonth = z.string().refine((month) => isCalendarDay(`${month}-01`));

export const mercadoPagoChargeCostsQuerySchema = z
  .object({ from: z.string().optional(), to: z.string().optional() })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

const figures = {
  gross_amount: signedCents,
  fee_amount: signedCents,
  financing_fee_amount: signedCents,
  taxes_amount: signedCents,
  net_amount: signedCents,
};

const entry = { charges_count: count, pending_count: count, ...figures };

export const mercadoPagoChargeCostsSchema = z.object({
  range: answeredRangeSchema,
  charges: z.array(
    z.object({
      payment_transaction_id: recordIdSchema(),
      sale_id: recordIdSchema(),
      method: z.enum(MERCADO_PAGO_PAYMENT_METHODS),
      register_id: recordIdSchema(),
      register_name: z.string(),
      amount: z.int().positive(),
      charged_at: instant,
      cost: z.object({ ...figures, money_release_date: instant.nullable() }).nullable(),
    }),
  ),
  days: z.array(z.object({ day: calendarDay, ...entry })),
  months: z.array(z.object({ month: calendarMonth, ...entry })),
  methods: z.array(z.object({ method: z.enum(CHARGE_COST_METHODS), ...entry })),
  registers: z.array(
    z.object({
      register_id: recordIdSchema().nullable(),
      register_name: z.string().nullable(),
      ...entry,
    }),
  ),
  totals: z.object(entry),
});

export type MercadoPagoChargeCostsQuery = z.output<typeof mercadoPagoChargeCostsQuerySchema>;
export type MercadoPagoChargeCostsBody = z.output<typeof mercadoPagoChargeCostsSchema>;
