import { z } from "zod";

export const registerRevocationSchema = z.object({
  revoked_at: z.string(),
});

export type RegisterRevocationBody = z.output<typeof registerRevocationSchema>;

export const everyInstallationRevocationSchema = z.object({
  revoked_at: z.string(),
  revoked_registers: z.number().int().positive(),
});

export type EveryInstallationRevocationBody = z.output<typeof everyInstallationRevocationSchema>;
