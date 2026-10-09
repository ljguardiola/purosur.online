import { recordIdSchema } from "@purosur/contracts";
import { z } from "zod";

export const recoveryRequestJobPayloadSchema = z.object({
  email: z.string(),
  // graphile-worker stores the payload as JSON, hence the ISO 8601 string.
  requestedAt: z.iso.datetime(),
  requestId: recordIdSchema(),
});

export type RecoveryRequestJobPayload = z.infer<typeof recoveryRequestJobPayloadSchema>;
