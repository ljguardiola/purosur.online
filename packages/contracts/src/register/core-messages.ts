import { z } from "zod";

const requestId = z.string();

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

export const rendererToCoreMessageSchema = z.discriminatedUnion("type", [
  rendererPingMessageSchema,
  enrollmentStatusRequestMessageSchema,
  registerNameRequestMessageSchema,
  enrollMessageSchema,
  signInUsersRequestMessageSchema,
  signInMessageSchema,
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

const signInOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("signed_in"),
    person: z.object({ first_name: z.string(), permission_keys: z.array(z.string()) }),
  }),
  z.object({ kind: z.literal("wrong_pin") }),
  z.object({ kind: z.literal("no_register_permission") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SignInOutcome = z.infer<typeof signInOutcomeSchema>;

const signInUserSchema = z.object({ id: z.string(), first_name: z.string() });
export type SignInUser = z.infer<typeof signInUserSchema>;

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
