import { z } from "zod";

export const sessionStatusSchema = z.object({
  expires_at: z.string(),
});

export type SessionStatusWire = z.output<typeof sessionStatusSchema>;
