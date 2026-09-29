import { z } from "zod";

export const roleSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  is_administrator: z.boolean(),
  permissions: z.array(z.string()),
  user_count: z.int(),
});

export const roleListSchema = z.array(roleSummarySchema);

export type RoleSummaryWire = z.output<typeof roleSummarySchema>;
