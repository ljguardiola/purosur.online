import { ARGENTINA_TIME_ZONE, CONFIRMED_BY_HAND_METHODS, isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema, reportQuerySchema } from "../shared/index.js";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();
export const handConfirmedPaymentMethodSchema = z.enum(CONFIRMED_BY_HAND_METHODS);
const method = handConfirmedPaymentMethodSchema;

export const handConfirmedPaymentsQuerySchema = reportQuerySchema.and(
  z.object({ method: method.optional() }),
);

const methodTotal = z.object({ method, count, amount: cents });

export const handConfirmedPaymentsSchema = z.object({
  range: z.object({ from: calendarDay, to: calendarDay }),
  totals: z.object({ count, amount: cents }),
  methods: z.array(methodTotal),
  cashiers: z.array(
    z.object({
      cashier_id: z.string().min(1),
      cashier_name: z.string().nullable(),
      count,
      amount: cents,
      methods: z.array(methodTotal),
    }),
  ),
  payments: z.array(
    z.object({
      id: recordIdSchema(),
      method,
      amount: cents,
      confirmed_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
      cashier_name: z.string().nullable(),
      confirmed_by_name: z.string().nullable(),
      sale_operation_number: z.int().positive().nullable(),
    }),
  ),
});

export type HandConfirmedPaymentsQuery = z.output<typeof handConfirmedPaymentsQuerySchema>;
export type HandConfirmedPaymentsBody = z.output<typeof handConfirmedPaymentsSchema>;
