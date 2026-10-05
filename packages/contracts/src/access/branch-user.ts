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
});

export const branchUserListSchema = z.array(branchUserSchema);

export type BranchUserWire = z.output<typeof branchUserSchema>;
