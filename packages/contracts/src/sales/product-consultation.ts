import { isValidDiscountWeekdays, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { requestIdSchema, restorationInProgressOutcomeSchema } from "../shared/index.js";
import { linePromotionSchema } from "./sale.js";

const cents = z.int().nonnegative();

export const consultProductMessageSchema = z.object({
  type: z.literal("consult-product"),
  request_id: requestIdSchema,
  product: z.union([
    z.strictObject({ product_id: z.string().min(1) }),
    z.strictObject({ barcode: z.string().min(1) }),
  ]),
});

export type ProductToConsult = z.infer<typeof consultProductMessageSchema>["product"];

const consultProductOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("consulted"),
    product_id: z.string(),
    name: z.string(),
    sale_unit: z.enum(SALE_UNITS),
    unit_price: cents.nullable(),
    promotion: z
      .object({
        benefit: linePromotionSchema,
        weekdays: z.array(z.number()).refine(isValidDiscountWeekdays),
      })
      .nullable(),
    weight_thousandths: z.int().positive().nullable(),
    amount: cents.nullable(),
    stock_thousandths: z.int().nullable(),
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  restorationInProgressOutcomeSchema,
  z.object({ kind: z.literal("unavailable") }),
]);
export type ConsultProductOutcome = z.infer<typeof consultProductOutcomeSchema>;

export const consultProductResultMessageSchema = z.object({
  type: z.literal("consult-product-result"),
  request_id: requestIdSchema,
  outcome: consultProductOutcomeSchema,
});
