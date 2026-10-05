import { CAPABILITIES, MANUAL_STOCK_MOVEMENT_KINDS } from "@purosur/domain";
import { z } from "zod";

export const openSessionSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  expires_at: z.string(),
  is_administrator: z.boolean(),
  capabilities: z.array(z.enum(CAPABILITIES)),
  stock_movement_kinds: z.array(z.enum(MANUAL_STOCK_MOVEMENT_KINDS)),
  may_emit_own_pin_code: z.boolean(),
});

export type OpenSessionWire = z.output<typeof openSessionSchema>;
