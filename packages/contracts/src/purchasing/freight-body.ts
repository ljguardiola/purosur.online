import {
  FREIGHT_CARRIER_NAME_MAX_LENGTH,
  FREIGHT_DESCRIPTION_MAX_LENGTH,
  isCalendarDay,
  isFreightAmount,
  isFreightCarrierNameTooLong,
  isFreightDescriptionTooLong,
  MIN_FREIGHT_PURCHASES,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema, requiredTextSchema } from "../shared/index.js";

const CALENDAR_DAY_MESSAGE = "date must be a calendar day in the form YYYY-MM-DD";
const AMOUNT_MESSAGE = "amountCents must be a positive whole number of cents";
const PURCHASES_MESSAGE = `purchaseIds must be a list of at least ${MIN_FREIGHT_PURCHASES} purchase's id`;

const carrierSchema = z.object({
  kind: z.literal("carrier"),
  name: requiredTextSchema("name", FREIGHT_CARRIER_NAME_MAX_LENGTH, isFreightCarrierNameTooLong),
});

const ownTripSchema = z.object({ kind: z.literal("own_trip") });

export const freightBodySchema = z.object({
  date: z.string({ error: CALENDAR_DAY_MESSAGE }).refine(isCalendarDay),
  amountCents: z.number({ error: AMOUNT_MESSAGE }).refine(isFreightAmount, AMOUNT_MESSAGE),
  description: requiredTextSchema(
    "description",
    FREIGHT_DESCRIPTION_MAX_LENGTH,
    isFreightDescriptionTooLong,
  ),
  means: z.discriminatedUnion("kind", [carrierSchema, ownTripSchema], {
    error: "means must be a carrier or the store's own trip",
  }),
  purchaseIds: z
    .array(recordIdSchema("purchaseIds must hold purchases' ids"), { error: PURCHASES_MESSAGE })
    .min(MIN_FREIGHT_PURCHASES, PURCHASES_MESSAGE)
    .refine((ids) => new Set(ids).size === ids.length, "purchaseIds must not repeat a purchase"),
});

export type FreightBody = z.input<typeof freightBodySchema>;
