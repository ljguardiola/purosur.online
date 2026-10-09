import { z } from "zod";
import { openCashSessionSchema, requestIdSchema, signedInPersonSchema } from "../shared/index.js";
import {
  checkPinCodeRedemptionMessageSchema,
  pinCodeRedemptionCheckMessageSchema,
} from "./pin-code-redemption-check.js";
import { pinPolicyMessageSchema, pinPolicyRequestMessageSchema } from "./pin-policy.js";

const requestId = requestIdSchema;

export const redeemPinCodeMessageSchema = z.object({
  type: z.literal("redeem-pin-code"),
  request_id: requestId,
  reset_code: z.string(),
  new_pin: z.string(),
});

const firstPinCodeRequestMessageSchema = z.object({
  type: z.literal("first-pin-code-request"),
  request_id: requestId,
  user_id: z.string(),
});

export const credentialsRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  pinPolicyRequestMessageSchema,
  checkPinCodeRedemptionMessageSchema,
  redeemPinCodeMessageSchema,
  firstPinCodeRequestMessageSchema,
]);
export type CredentialsRendererToCoreMessage = z.infer<
  typeof credentialsRendererToCoreMessageSchema
>;

const pinCodeRedemptionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("redeemed") }),
  z.object({
    kind: z.literal("resumed"),
    person: signedInPersonSchema,
    cash_session: openCashSessionSchema.nullable(),
  }),
  z.object({ kind: z.literal("cash_session_opened_by_another") }),
  z.object({ kind: z.literal("code_invalid") }),
  z.object({ kind: z.literal("code_expired") }),
  z.object({ kind: z.literal("code_burned") }),
  z.object({ kind: z.literal("pin_rejected") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({
    kind: z.literal("invalid_input"),
    fields: z.array(z.enum(["reset_code", "new_pin"])),
  }),
]);
export type PinCodeRedemptionOutcome = z.infer<typeof pinCodeRedemptionOutcomeSchema>;

const firstPinCodeRequestOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sent") }),
  z.object({ kind: z.literal("pin_already_set") }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type FirstPinCodeRequestOutcome = z.infer<typeof firstPinCodeRequestOutcomeSchema>;

export const credentialsCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  pinPolicyMessageSchema,
  pinCodeRedemptionCheckMessageSchema,
  z.object({
    type: z.literal("pin-code-redemption-result"),
    request_id: requestId,
    outcome: pinCodeRedemptionOutcomeSchema,
  }),
  z.object({
    type: z.literal("first-pin-code-request-result"),
    request_id: requestId,
    outcome: firstPinCodeRequestOutcomeSchema,
  }),
]);
export type CredentialsCoreToRendererMessage = z.infer<
  typeof credentialsCoreToRendererMessageSchema
>;
