import { type AlertKind, ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";
import { alertAudienceSchema, alertLevelSchema } from "./alert-summary.js";

const alertDeliverySchema = z.object({
  channel: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  createdAt: z.string(),
  recipient: z.object({
    id: z.string(),
    firstName: z.string(),
    role: z.object({
      id: z.string(),
      name: z.string().nullable(),
      isAdministrator: z.boolean(),
    }),
  }),
});

const actorName = z.string().optional();

const alertRoleSummarySchema = z.object({
  name: z.string().nullable(),
  isAdministrator: z.boolean(),
});

const passkeyChangedDetailSchema = z.union([
  z.object({
    action: z.enum(["registered", "removed"]),
    passkeyName: z.string(),
    actorId: z.string(),
    via: z.literal("self"),
  }),
  z.object({
    action: z.literal("registered"),
    passkeyName: z.string(),
    actorId: z.string(),
    via: z.literal("recovery"),
  }),
  z.object({
    action: z.literal("removed"),
    passkeyName: z.string(),
    actorId: z.string(),
    via: z.literal("administrator"),
    actorName,
  }),
]);

const recoveryRequestedDetailSchema = z.object({
  requestedAt: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
});

const emailChangedDetailSchema = z.object({
  previousEmail: z.string(),
  newEmail: z.string(),
  actorId: z.string(),
  actorName,
});

const signInLockoutDetailSchema = z.object({
  sourceAddress: z.string().optional(),
  failureCount: z.number(),
  blockedUntil: z.string(),
});

const accessIncreasedDetailSchema = z.discriminatedUnion("cause", [
  z.object({ cause: z.literal("created_as_administrator"), actorId: z.string(), actorName }),
  z.object({
    cause: z.literal("role_assigned"),
    previousRole: alertRoleSummarySchema,
    newRole: alertRoleSummarySchema,
    actorId: z.string(),
    actorName,
  }),
  z.object({
    cause: z.literal("role_permissions_added"),
    roleName: z.string(),
    addedPermissionKeys: z.array(z.string()).readonly(),
    actorId: z.string(),
    actorName,
  }),
]);

const registerEnrolledDetailSchema = z.object({
  deviceId: z.string(),
  hostname: z.string(),
  windowsVersion: z.string(),
  replacedInstallation: z.boolean(),
});

const ALERT_INSTANT = { timeZone: ARGENTINA_TIME_ZONE };

const alertBase = {
  id: z.string(),
  scope: z.string().nullable(),
  scopeDisplay: z.string().nullable(),
  level: alertLevelSchema,
  audience: alertAudienceSchema,
  openedAt: z.string().meta(ALERT_INSTANT),
  escalatedAt: z.string().nullable().meta(ALERT_INSTANT),
  resolvedAt: z.string().nullable().meta(ALERT_INSTANT),
  open: z.boolean(),
  deliveries: z.array(alertDeliverySchema),
};

const alertDetailKinds = [
  z.object({
    ...alertBase,
    kind: z.literal("backoffice_passkey_changed" satisfies AlertKind),
    detail: passkeyChangedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("backoffice_recovery_requested" satisfies AlertKind),
    detail: recoveryRequestedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("user_email_changed" satisfies AlertKind),
    detail: emailChangedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("backoffice_sign_in_lockout" satisfies AlertKind),
    detail: signInLockoutDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("user_access_increased" satisfies AlertKind),
    detail: accessIncreasedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("register_enrolled" satisfies AlertKind),
    detail: registerEnrolledDetailSchema,
  }),
] as const;

export const alertDetailSchema = z.discriminatedUnion("kind", alertDetailKinds);

export type AlertDetail = z.output<typeof alertDetailSchema>;
