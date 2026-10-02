import {
  DISCOUNT_NAME_MAX_LENGTH,
  isCalendarDay,
  isDiscountNameTooLong,
  isDiscountWindowOrdered,
  isTargetKindAllowedFor,
  isValidDiscountWeekdays,
} from "@purosur/domain";
import { z } from "zod";
import { discountBenefitSchema, discountTargetSchema } from "../shared/index.js";

const NAME_EMPTY_MESSAGE = "name must not be empty";
const WEEKDAYS_MESSAGE = "weekdays must be distinct ISO weekdays, 1 (Monday) to 7 (Sunday)";

function calendarDaySchema(field: "validFrom" | "validTo") {
  const message = `${field} must be a calendar day as YYYY-MM-DD`;
  return z.string({ error: message }).refine(isCalendarDay, message);
}

export const discountNameSchema = z
  .string({ error: NAME_EMPTY_MESSAGE })
  .trim()
  .min(1, NAME_EMPTY_MESSAGE)
  .refine(
    (name) => !isDiscountNameTooLong(name),
    `name must be at most ${DISCOUNT_NAME_MAX_LENGTH} characters`,
  )
  .meta({ maxLength: DISCOUNT_NAME_MAX_LENGTH });

export const discountCreationBodySchema = z
  .object({
    name: discountNameSchema,
    benefit: discountBenefitSchema,
    target: discountTargetSchema,
    validFrom: calendarDaySchema("validFrom"),
    validTo: calendarDaySchema("validTo"),
    weekdays: z
      .array(z.number({ error: WEEKDAYS_MESSAGE }), { error: WEEKDAYS_MESSAGE })
      .refine(isValidDiscountWeekdays, WEEKDAYS_MESSAGE),
  })
  .superRefine((discount, context) => {
    if (!isTargetKindAllowedFor(discount.benefit.kind, discount.target.kind)) {
      context.addIssue({
        code: "custom",
        path: ["target", "kind"],
        message: "target.kind must be PRODUCT for a BUY_N_PAY_M benefit",
      });
    }
  })
  .superRefine(
    (discount, context) => {
      if (!isDiscountWindowOrdered(discount.validFrom, discount.validTo)) {
        context.addIssue({
          code: "custom",
          path: ["validTo"],
          message: "validTo must not be before validFrom",
        });
      }
    },
    {
      // zod records a body that is not an object with no path, and keeps checking it.
      when: ({ issues }) =>
        issues.every(
          (issue) =>
            issue.path !== undefined &&
            issue.path[0] !== "validFrom" &&
            issue.path[0] !== "validTo",
        ),
    },
  );

export type DiscountCreationBody = z.input<typeof discountCreationBodySchema>;
