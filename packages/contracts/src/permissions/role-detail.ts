import { z } from "zod";
import { roleSummarySchema } from "./role-summary.js";

export const roleDetailSchema = roleSummarySchema.extend({
  version: z.int(),
  assigned_users: z.array(z.object({ id: z.string(), name: z.string() })),
});

export type RoleDetailWire = z.output<typeof roleDetailSchema>;
