import { z } from "zod";

const hoursRangeSchema = z.object({ opens_at: z.string(), closes_at: z.string() });

const dayHoursSchema = z.array(hoursRangeSchema);

export const branchSettingsSchema = z.object({
  address: z.string(),
  whatsapp_number: z.string(),
  instagram_handle: z.string(),
  monday_hours: dayHoursSchema,
  tuesday_hours: dayHoursSchema,
  wednesday_hours: dayHoursSchema,
  thursday_hours: dayHoursSchema,
  friday_hours: dayHoursSchema,
  saturday_hours: dayHoursSchema,
  sunday_hours: dayHoursSchema,
  expiring_lot_alert_days: z.int(),
  unreviewed_price_alert_days: z.int(),
  good_condition_return_days: z.int(),
  version: z.int(),
});

export type BranchSettingsBody = z.output<typeof branchSettingsSchema>;
