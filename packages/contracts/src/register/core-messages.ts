import { z } from "zod";

const requestId = z.string();

const rendererPingMessageSchema = z.object({
  type: z.literal("ping"),
});

const enrollmentStatusRequestMessageSchema = z.object({
  type: z.literal("enrollment-status-request"),
  request_id: requestId,
});

const enrollMessageSchema = z.object({
  type: z.literal("enroll"),
  request_id: requestId,
  code: z.string(),
});

const redeemPinCodeMessageSchema = z.object({
  type: z.literal("redeem-pin-code"),
  request_id: requestId,
  reset_code: z.string(),
  new_pin: z.string(),
});

export const rendererToCoreMessageSchema = z.discriminatedUnion("type", [
  rendererPingMessageSchema,
  enrollmentStatusRequestMessageSchema,
  enrollMessageSchema,
  redeemPinCodeMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

const enrollmentOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enrolled") }),
  z.object({ kind: z.literal("code_rejected") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("not_stored") }),
]);
export type EnrollmentOutcome = z.infer<typeof enrollmentOutcomeSchema>;

const pinCodeRedemptionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("redeemed") }),
  z.object({ kind: z.literal("code_invalid") }),
  z.object({ kind: z.literal("code_expired") }),
  z.object({ kind: z.literal("code_burned") }),
  z.object({ kind: z.literal("pin_rejected") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type PinCodeRedemptionOutcome = z.infer<typeof pinCodeRedemptionOutcomeSchema>;

export const coreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enrollment-status"), request_id: requestId, enrolled: z.boolean() }),
  z.object({
    type: z.literal("enrollment-result"),
    request_id: requestId,
    outcome: enrollmentOutcomeSchema,
  }),
  z.object({
    type: z.literal("pin-code-redemption-result"),
    request_id: requestId,
    outcome: pinCodeRedemptionOutcomeSchema,
  }),
]);
export type CoreToRendererMessage = z.infer<typeof coreToRendererMessageSchema>;

const mainHealthCheckMessageSchema = z.object({
  type: z.literal("health-check"),
});

export const mainToCoreMessageSchema = mainHealthCheckMessageSchema;
export type MainToCoreMessage = z.infer<typeof mainToCoreMessageSchema>;

export const coreStatusMessageSchema = z.object({
  type: z.literal("core-status"),
  status: z.enum(["starting", "down", "up"]),
});
export type CoreStatusMessage = z.infer<typeof coreStatusMessageSchema>;
