import {
  BRANCH_HOURS_RANGES_PER_DAY_MAX,
  BRANCH_SETTINGS_DAYS_MAX,
  BRANCH_SETTINGS_TEXT_MAX_LENGTH,
  branchHoursRangesOverlap,
  isBranchHoursRangeOrdered,
  isBranchHoursTime,
} from "@purosur/domain";
import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";

function textSchema(field: string) {
  const message = `${field} must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`;
  return z.string({ error: message }).trim().max(BRANCH_SETTINGS_TEXT_MAX_LENGTH, message);
}

function dayHoursSchema(field: string) {
  const message = `${field} must be a list of at most ${BRANCH_HOURS_RANGES_PER_DAY_MAX} non-overlapping HH:MM opens_at/closes_at ranges, each with closes_at later`;
  const time = z.string({ error: message }).refine(isBranchHoursTime, message);
  const range = z
    .object({ opens_at: time, closes_at: time }, { error: message })
    .refine(
      (value) => isBranchHoursRangeOrdered({ opensAt: value.opens_at, closesAt: value.closes_at }),
      message,
    );
  return z
    .array(range, { error: message })
    .max(BRANCH_HOURS_RANGES_PER_DAY_MAX, message)
    .refine(
      (ranges) =>
        !branchHoursRangesOverlap(
          ranges.map((value) => ({ opensAt: value.opens_at, closesAt: value.closes_at })),
        ),
      message,
    );
}

function daysSchema(field: string) {
  const message = `${field} must be an integer from 0 to ${BRANCH_SETTINGS_DAYS_MAX}`;
  return z
    .number({ error: message })
    .int(message)
    .min(0, message)
    .max(BRANCH_SETTINGS_DAYS_MAX, message);
}

export const branchSettingsEditBodySchema = z.object({
  address: textSchema("address"),
  whatsapp_number: textSchema("whatsapp_number"),
  instagram_handle: textSchema("instagram_handle"),
  monday_hours: dayHoursSchema("monday_hours"),
  tuesday_hours: dayHoursSchema("tuesday_hours"),
  wednesday_hours: dayHoursSchema("wednesday_hours"),
  thursday_hours: dayHoursSchema("thursday_hours"),
  friday_hours: dayHoursSchema("friday_hours"),
  saturday_hours: dayHoursSchema("saturday_hours"),
  sunday_hours: dayHoursSchema("sunday_hours"),
  expiring_lot_alert_days: daysSchema("expiring_lot_alert_days"),
  unreviewed_price_alert_days: daysSchema("unreviewed_price_alert_days"),
  good_condition_return_days: daysSchema("good_condition_return_days"),
  version: loadedVersionSchema,
});

export type BranchSettingsEditBody = z.input<typeof branchSettingsEditBodySchema>;
