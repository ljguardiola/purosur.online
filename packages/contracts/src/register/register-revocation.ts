import { z } from "zod";

export const registerRevocationSchema = z.object({
  revoked_at: z.string(),
});

export type RegisterRevocationBody = z.output<typeof registerRevocationSchema>;
