import { z } from "zod";

export const pinPolicyRequestMessageSchema = z.object({
  type: z.literal("pin-policy-request"),
  request_id: z.string(),
});

const pinPolicySchema = z.object({ min_digits: z.int().positive() });
export type PinPolicy = z.infer<typeof pinPolicySchema>;

export const pinPolicyMessageSchema = z.object({
  type: z.literal("pin-policy"),
  request_id: z.string(),
  ...pinPolicySchema.shape,
});
