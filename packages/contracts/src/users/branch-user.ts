import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";

export const branchUserSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  email: z.string(),
  version: z.int(),
  active: z.boolean().optional(),
  role: z.object({
    id: z.string(),
    is_administrator: z.boolean(),
    name: z.string().nullable(),
  }),
  passkey_count: z.int(),
  is_last_active_administrator: z.boolean(),
  may_emit_pin_code: z.boolean(),
  may_edit: z.boolean(),
  may_deactivate: z.boolean(),
  may_reactivate: z.boolean(),
  may_remove_passkey: z.boolean(),
  alert_email_opted_in_at: z.iso.datetime().nullable().meta({ timeZone: ARGENTINA_TIME_ZONE }),
});

export const branchUserListSchema = z.array(branchUserSchema);

export type BranchUserWire = z.output<typeof branchUserSchema>;
