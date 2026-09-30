import {
  ARGENTINA_TIME_ZONE,
  type AuthorizablePermissionKey,
  isAuthorizablePermissionKey,
  isValidCashAmount,
  parseAmountCents,
} from "@purosur/domain";
import { z } from "zod";
import { pinAttemptRefusalSchema } from "../access/pin-attempt-refusal.js";

const requestId = z.string();

export const openingFloatSchema = z.number().refine(isValidCashAmount);

export { ARGENTINA_TIME_ZONE, parseAmountCents };

const rendererPingMessageSchema = z.object({
  type: z.literal("ping"),
});

const enrollmentStatusRequestMessageSchema = z.object({
  type: z.literal("enrollment-status-request"),
  request_id: requestId,
});

const registerNameRequestMessageSchema = z.object({
  type: z.literal("register-name-request"),
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

const signInUsersRequestMessageSchema = z.object({
  type: z.literal("sign-in-users"),
  request_id: requestId,
});

const signInMessageSchema = z.object({
  type: z.literal("sign-in"),
  request_id: requestId,
  user_id: z.string(),
  pin: z.string(),
});

const signInLookupMessageSchema = z.object({
  type: z.literal("sign-in-lookup"),
  request_id: requestId,
  email: z.string(),
});

const firstSignInMessageSchema = z.object({
  type: z.literal("first-sign-in"),
  request_id: requestId,
  user_id: z.string(),
  pin: z.string(),
});

const openCashSessionMessageSchema = z.object({
  type: z.literal("open-cash-session"),
  request_id: requestId,
  user_id: z.string(),
  opening_float: openingFloatSchema,
});

const cashSessionRequestMessageSchema = z.object({
  type: z.literal("cash-session-request"),
  request_id: requestId,
});

const authorizersRequestMessageSchema = z.object({
  type: z.literal("authorizers"),
  request_id: requestId,
  permission: z.custom<AuthorizablePermissionKey>(isAuthorizablePermissionKey),
});

export const rendererToCoreMessageSchema = z.discriminatedUnion("type", [
  rendererPingMessageSchema,
  enrollmentStatusRequestMessageSchema,
  registerNameRequestMessageSchema,
  enrollMessageSchema,
  redeemPinCodeMessageSchema,
  signInUsersRequestMessageSchema,
  signInMessageSchema,
  signInLookupMessageSchema,
  firstSignInMessageSchema,
  openCashSessionMessageSchema,
  cashSessionRequestMessageSchema,
  authorizersRequestMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

const enrollmentOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enrolled") }),
  z.object({ kind: z.literal("code_rejected") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("storage_unavailable") }),
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

const signedInPersonSchema = z.object({
  user_id: z.string(),
  first_name: z.string(),
  permission_keys: z.array(z.string()),
});

const signInOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("signed_in"), person: signedInPersonSchema }),
  ...pinAttemptRefusalSchema.options,
  z.object({ kind: z.literal("no_register_permission") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SignInOutcome = z.infer<typeof signInOutcomeSchema>;

const openCashSessionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("opened"),
    session: z.object({ id: z.string(), opened_at: z.string(), opening_float: z.number() }),
  }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("already_open") }),
  z.object({ kind: z.literal("invalid_opening_float") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type OpenCashSessionOutcome = z.infer<typeof openCashSessionOutcomeSchema>;

const openCashSessionSchema = z.object({
  id: z.string(),
  opened_at: z.string(),
  opened_by: signedInPersonSchema,
});
export type OpenCashSession = z.infer<typeof openCashSessionSchema>;

const signInUserSchema = z.object({ id: z.string(), first_name: z.string() });
export type SignInUser = z.infer<typeof signInUserSchema>;

const signInLookupOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("has_pin"), user: signInUserSchema }),
  z.object({ kind: z.literal("no_pin"), user: signInUserSchema }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("invalid_email") }),
  z.object({ kind: z.literal("not_synced") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SignInLookupOutcome = z.infer<typeof signInLookupOutcomeSchema>;

export const coreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enrollment-status"), request_id: requestId, enrolled: z.boolean() }),
  z.object({
    type: z.literal("register-name"),
    request_id: requestId,
    name: z.string().nullable(),
  }),
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
  z.object({
    type: z.literal("sign-in-users"),
    request_id: requestId,
    users: z.array(signInUserSchema),
  }),
  z.object({ type: z.literal("sign-in-users-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("sign-in-result"),
    request_id: requestId,
    outcome: signInOutcomeSchema,
  }),
  z.object({
    type: z.literal("sign-in-lookup-result"),
    request_id: requestId,
    outcome: signInLookupOutcomeSchema,
  }),
  z.object({
    type: z.literal("open-cash-session-result"),
    request_id: requestId,
    outcome: openCashSessionOutcomeSchema,
  }),
  z.object({
    type: z.literal("cash-session"),
    request_id: requestId,
    session: openCashSessionSchema.nullable(),
  }),
  z.object({ type: z.literal("cash-session-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("authorizers"),
    request_id: requestId,
    users: z.array(signInUserSchema),
  }),
  z.object({ type: z.literal("authorizers-unavailable"), request_id: requestId }),
  z.object({ type: z.literal("pulled") }),
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
