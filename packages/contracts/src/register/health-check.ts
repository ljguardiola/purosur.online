import { z } from "zod";

export const healthCheckSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  installation: z.object({ revoked: z.boolean() }).optional(),
});

export type HealthCheck = z.output<typeof healthCheckSchema>;
