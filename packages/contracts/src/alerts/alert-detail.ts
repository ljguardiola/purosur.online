import {
  ALERT_CLOSINGS,
  type AlertKind,
  ARGENTINA_TIME_ZONE,
  CREDIT_NOTE_C_DOCUMENT_TYPE,
  FACTURA_C_DOCUMENT_TYPE,
  FORTNIGHT_REPORT_PENDING_REASONS,
  OFFSITE_DUMP_UNVERIFIED_REASONS,
  PRE_EMISSION_GATE_FAILURE_REASONS,
  REJECTION_CLASSES,
  SALES_DENIED_REASONS,
} from "@purosur/domain";
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

const registerEnrolledDetailSchema = z.discriminatedUnion("change", [
  z.object({
    change: z.literal("enrolled"),
    deviceId: z.string(),
    hostname: z.string(),
    windowsVersion: z.string(),
    replacedInstallation: z.boolean(),
  }),
  z.object({
    change: z.literal("revoked"),
    deviceId: z.string(),
    hostname: z.string(),
    windowsVersion: z.string(),
  }),
]);

const eventsQuarantinedDetailSchema = z.object({
  deviceId: z.string(),
});

const eventInvariantViolatedDetailSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  breaks: z.array(z.string()),
});

const arcaCertificateExpiringDetailSchema = z.object({
  notAfter: z.string(),
});

const updateRequiredDetailSchema = z.object({
  deviceId: z.string(),
  appVersion: z.string(),
});

const registerSilentDetailSchema = z.object({
  deviceId: z.string(),
  lastAcceptedPushAt: z.string(),
});

const offlineAuthorizationCodeMissingDetailSchema = z.object({
  deviceId: z.string(),
  fortnightStart: z.string(),
  fortnightEnd: z.string(),
  fortnightStarted: z.boolean(),
});

const salesDeniedDetailSchema = z.object({
  deviceId: z.string(),
  reason: z.enum(SALES_DENIED_REASONS),
});

const fiscalRejectedDetailSchema = z.object({
  pointOfSale: z.int(),
  documentType: z.literal(FACTURA_C_DOCUMENT_TYPE),
  rejectionClass: z.enum(REJECTION_CLASSES),
  fiscalDocumentId: z.string(),
  saleId: z.string(),
  rejections: z.array(z.object({ code: z.int(), message: z.string() })),
});

const externalBillingDetailSchema = z.object({
  pointOfSale: z.int(),
  documentType: z.enum([FACTURA_C_DOCUMENT_TYPE, CREDIT_NOTE_C_DOCUMENT_TYPE]),
  number: z.int(),
});

const clockCorrectedDetailSchema = z.object({
  pointOfSale: z.int(),
  documentType: z.literal(FACTURA_C_DOCUMENT_TYPE),
  previousReading: z.string(),
  correctedReading: z.string(),
  actorId: z.string(),
  actorName,
});

const latePaymentRefundDetailSchema = z.object({
  saleId: z.string(),
  amount: z.int(),
  providerOrderId: z.string().nullable(),
});

const refundTaskDetailSchema = z.object({
  saleId: z.string(),
  amount: z.int(),
  method: z.string(),
  refundOpenedAt: z.string(),
});

const fiscalUnknownDetailSchema = z.object({
  fiscalDocumentId: z.string(),
  saleId: z.string(),
  registerId: z.string(),
  pointOfSale: z.int(),
  number: z.int(),
  unclearSince: z.string(),
});

const fiscalEmissionStoppedDetailSchema = z.object({
  deviceId: z.string(),
  reason: z.enum(PRE_EMISSION_GATE_FAILURE_REASONS),
});

const clockDriftDetailSchema = z.object({
  deviceId: z.string(),
});

const outboxChainBrokenDetailSchema = z.object({
  deviceId: z.string(),
});

const offsiteDumpUnverifiedDetailSchema = z.discriminatedUnion("reason", [
  z.object({
    night: z.string(),
    reason: z.enum(OFFSITE_DUMP_UNVERIFIED_REASONS).exclude(["shrank"]),
  }),
  z.object({
    night: z.string(),
    reason: z.literal("shrank"),
    shrinkThresholdPercent: z.int(),
  }),
]);

const lotsExpiringDetailSchema = z.object({
  lotCount: z.int(),
  windowDays: z.int(),
  aboutViewerBranch: z.boolean(),
});

const fortnightReportOwedElsewhereDetailSchema = z.object({
  pointOfSaleNumber: z.int(),
  fortnightStart: z.string(),
  fortnightEnd: z.string(),
});

const fortnightReportNeedsRegularizationDetailSchema =
  fortnightReportOwedElsewhereDetailSchema.extend({
    registerId: z.string(),
    registerName: z.string().optional(),
  });

const fortnightReportOverdueDetailSchema = fortnightReportNeedsRegularizationDetailSchema.extend({
  deadline: z.string(),
});

const fortnightReportPendingDetailSchema = fortnightReportOverdueDetailSchema.extend({
  daysLeft: z.int(),
  reason: z.enum(FORTNIGHT_REPORT_PENDING_REASONS),
});

const ALERT_INSTANT = { timeZone: ARGENTINA_TIME_ZONE };

const alertBase = {
  id: z.string(),
  scope: z.string().nullable(),
  scopeDisplay: z.string().nullable(),
  scopeKind: z.string(),
  level: alertLevelSchema,
  audience: alertAudienceSchema,
  openedAt: z.string().meta(ALERT_INSTANT),
  escalatedAt: z.string().nullable().meta(ALERT_INSTANT),
  resolvedAt: z.string().nullable().meta(ALERT_INSTANT),
  open: z.boolean(),
  closing: z.enum(ALERT_CLOSINGS),
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
  z.object({
    ...alertBase,
    kind: z.literal("events_quarantined" satisfies AlertKind),
    detail: eventsQuarantinedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("event_invariant_violated" satisfies AlertKind),
    detail: eventInvariantViolatedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("arca_certificate_expiring" satisfies AlertKind),
    detail: arcaCertificateExpiringDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("arca_wsaa_ticket_held" satisfies AlertKind),
    detail: z.object({ retryIntervalMinutes: z.number() }),
  }),
  z.object({
    ...alertBase,
    kind: z.literal("update_required" satisfies AlertKind),
    detail: updateRequiredDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("register_silent" satisfies AlertKind),
    detail: registerSilentDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("sales_denied" satisfies AlertKind),
    detail: salesDeniedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("fiscal_rejected" satisfies AlertKind),
    detail: fiscalRejectedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("offline_authorization_code_missing" satisfies AlertKind),
    detail: offlineAuthorizationCodeMissingDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("late_payment_refund" satisfies AlertKind),
    detail: latePaymentRefundDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("refund_task" satisfies AlertKind),
    detail: refundTaskDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("fiscal_unknown" satisfies AlertKind),
    detail: fiscalUnknownDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("fiscal_emission_stopped" satisfies AlertKind),
    detail: fiscalEmissionStoppedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("clock_drift" satisfies AlertKind),
    detail: clockDriftDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("outbox_chain_broken" satisfies AlertKind),
    detail: outboxChainBrokenDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("lots_expiring" satisfies AlertKind),
    detail: lotsExpiringDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("offsite_dump_unverified" satisfies AlertKind),
    detail: offsiteDumpUnverifiedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("fortnight_report_pending" satisfies AlertKind),
    detail: fortnightReportPendingDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("fortnight_report_overdue" satisfies AlertKind),
    detail: fortnightReportOverdueDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("clock_corrected" satisfies AlertKind),
    detail: clockCorrectedDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("external_billing" satisfies AlertKind),
    detail: externalBillingDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("fortnight_report_needs_regularization" satisfies AlertKind),
    detail: fortnightReportNeedsRegularizationDetailSchema,
  }),
  z.object({
    ...alertBase,
    kind: z.literal("fortnight_report_owed_elsewhere" satisfies AlertKind),
    detail: fortnightReportOwedElsewhereDetailSchema,
  }),
] as const;

export const alertDetailSchema = z.discriminatedUnion("kind", alertDetailKinds);

export type AlertDetail = z.output<typeof alertDetailSchema>;
