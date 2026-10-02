import { CAPABILITIES } from "@purosur/domain";
import { z } from "zod";

export const openSessionSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  expires_at: z.string(),
  is_administrator: z.boolean(),
  permissions: z.array(z.string()),
  capabilities: z.array(z.enum(CAPABILITIES)),
});

export type OpenSessionWire = z.output<typeof openSessionSchema>;
