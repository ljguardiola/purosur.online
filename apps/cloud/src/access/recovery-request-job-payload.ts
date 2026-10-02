import { z } from "zod";

export const recoveryRequestJobPayloadSchema = z.object({
  email: z.string(),
  // graphile-worker stores the payload as JSON, hence the ISO 8601 string.
  requestedAt: z.iso.datetime(),
  requestId: z.uuid(),
});

export type RecoveryRequestJobPayload = z.infer<typeof recoveryRequestJobPayloadSchema>;
