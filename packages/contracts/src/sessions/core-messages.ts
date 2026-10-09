import { type AuthorizablePermissionKey, isAuthorizablePermissionKey } from "@purosur/domain";
import { z } from "zod";
import {
  openCashSessionSchema,
  pinAttemptRefusalSchema,
  requestIdSchema,
  signedInPersonSchema,
  signInUserSchema,
} from "../shared/index.js";

const requestId = requestIdSchema;

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

export const signInLookupMessageSchema = z.object({
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

const authorizersRequestMessageSchema = z.object({
  type: z.literal("authorizers"),
  request_id: requestId,
  permission: z.custom<AuthorizablePermissionKey>(isAuthorizablePermissionKey),
});

const signOutMessageSchema = z.object({
  type: z.literal("sign-out"),
  request_id: requestId,
});

export const sessionsRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  signInUsersRequestMessageSchema,
  signInMessageSchema,
  signInLookupMessageSchema,
  firstSignInMessageSchema,
  authorizersRequestMessageSchema,
  signOutMessageSchema,
]);
export type SessionsRendererToCoreMessage = z.infer<typeof sessionsRendererToCoreMessageSchema>;

const signInOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("signed_in"),
    person: signedInPersonSchema,
    cash_session: openCashSessionSchema.nullable(),
  }),
  ...pinAttemptRefusalSchema.options,
  z.object({ kind: z.literal("no_register_permission") }),
  z.object({ kind: z.literal("cash_session_opened_by_another") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SignInOutcome = z.infer<typeof signInOutcomeSchema>;

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

export const sessionsCoreToRendererMessageSchema = z.discriminatedUnion("type", [
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
    type: z.literal("authorizers"),
    request_id: requestId,
    users: z.array(signInUserSchema),
  }),
  z.object({ type: z.literal("authorizers-unavailable"), request_id: requestId }),
  z.object({ type: z.literal("signed-out"), request_id: requestId }),
]);
export type SessionsCoreToRendererMessage = z.infer<typeof sessionsCoreToRendererMessageSchema>;
