import { z } from "zod";

export const recoveryTokenBodySchema = z.object({
  recovery_token: z
    .string({ error: "recovery_token is required" })
    .min(1, "recovery_token is required"),
});

export type RecoveryTokenBody = z.input<typeof recoveryTokenBodySchema>;
