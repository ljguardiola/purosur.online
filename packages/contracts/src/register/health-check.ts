import { z } from "zod";

export const healthCheckSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  installation: z.object({ revoked: z.boolean() }).optional(),
  arca: z
    .object({
      token_valid: z.boolean(),
      probe_ok_at: z.iso.datetime().nullable(),
      reachable: z.boolean(),
    })
    .optional(),
});

export type HealthCheck = z.output<typeof healthCheckSchema>;
