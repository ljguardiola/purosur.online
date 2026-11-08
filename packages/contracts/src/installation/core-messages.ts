import { z } from "zod";
import { requestIdSchema } from "../shared/index.js";

const enrollmentStatusRequestMessageSchema = z.object({
  type: z.literal("enrollment-status-request"),
  request_id: requestIdSchema,
});

const registerServiceRequestMessageSchema = z.object({
  type: z.literal("register-service-request"),
  request_id: requestIdSchema,
});

const registerNameRequestMessageSchema = z.object({
  type: z.literal("register-name-request"),
  request_id: requestIdSchema,
});

export const enrollMessageSchema = z.object({
  type: z.literal("enroll"),
  request_id: requestIdSchema,
  code: z.string(),
});

const checkEnrollmentCodeMessageSchema = z.object({
  type: z.literal("check-enrollment-code"),
  request_id: requestIdSchema,
  code: z.string(),
});

const enrollmentOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enrolled") }),
  z.object({ kind: z.literal("code_rejected") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("storage_unavailable") }),
  z.object({ kind: z.literal("not_stored") }),
  z.object({ kind: z.literal("invalid_input"), fields: z.array(z.literal("code")) }),
]);
export type EnrollmentOutcome = z.infer<typeof enrollmentOutcomeSchema>;

const enrollmentStandingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_enrolled") }),
  z.object({ kind: z.literal("enrolled") }),
  z.object({ kind: z.literal("revoked") }),
]);
export type EnrollmentStandingAnswer = z.infer<typeof enrollmentStandingSchema>;

export const installationRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  enrollmentStatusRequestMessageSchema,
  registerServiceRequestMessageSchema,
  registerNameRequestMessageSchema,
  enrollMessageSchema,
  checkEnrollmentCodeMessageSchema,
]);
export type InstallationRendererToCoreMessage = z.infer<
  typeof installationRendererToCoreMessageSchema
>;

export const installationCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("enrollment-status"),
    request_id: requestIdSchema,
    standing: enrollmentStandingSchema,
  }),
  z.object({
    type: z.literal("register-service"),
    request_id: requestIdSchema,
    service: z.enum(["in_service", "out_of_service"]),
  }),
  z.object({
    type: z.literal("register-name"),
    request_id: requestIdSchema,
    name: z.string().nullable(),
  }),
  z.object({
    type: z.literal("enrollment-result"),
    request_id: requestIdSchema,
    outcome: enrollmentOutcomeSchema,
  }),
  z.object({
    type: z.literal("enrollment-code-check"),
    request_id: requestIdSchema,
    fields: z.array(z.literal("code")),
  }),
  z.object({ type: z.literal("enrollment-standing-changed") }),
]);
export type InstallationCoreToRendererMessage = z.infer<
  typeof installationCoreToRendererMessageSchema
>;
