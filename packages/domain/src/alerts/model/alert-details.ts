import type {
  FiscalDocumentType,
  FiscalTaskDocumentType,
  PreEmissionGateFailureReason,
  RejectionClass,
  TaxAuthorityRejection,
} from "../../fiscal/index.js";
import type { SalesDeniedReason } from "../../shared/index.js";
import type { AlertKind } from "./alert-catalog.js";
import type { OffsiteDumpUnverifiedReason } from "./offsite-dump-unverified-reason.js";

export type PasskeyChangedDetail =
  | { action: "registered" | "removed"; passkeyName: string; actorId: string; via: "self" }
  | { action: "registered"; passkeyName: string; actorId: string; via: "recovery" }
  | { action: "removed"; passkeyName: string; actorId: string; via: "administrator" };

export interface RecoveryRequestedDetail {
  requestedAt: string;
  issuedAt: string;
  expiresAt: string;
}

export interface EmailChangedDetail {
  previousEmail: string;
  newEmail: string;
  actorId: string;
}

export interface SignInLockoutDetail {
  sourceAddress: string;
  failureCount: number;
  blockedUntil: string;
}

export interface AlertRoleSummary {
  name: string | null;
  isAdministrator: boolean;
}

export type AccessIncreasedDetail =
  | { cause: "created_as_administrator"; actorId: string }
  | {
      cause: "role_assigned";
      previousRole: AlertRoleSummary;
      newRole: AlertRoleSummary;
      actorId: string;
    }
  | {
      cause: "role_permissions_added";
      roleName: string;
      addedPermissionKeys: readonly string[];
      actorId: string;
    };

export type RegisterEnrolledDetail =
  | {
      change: "enrolled";
      deviceId: string;
      hostname: string;
      windowsVersion: string;
      replacedInstallation: boolean;
    }
  | { change: "revoked"; deviceId: string; hostname: string; windowsVersion: string };

interface EventsQuarantinedDetail {
  deviceId: string;
}

interface EventInvariantViolatedDetail {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  breaks: string[];
}

export interface ArcaCertificateExpiringDetail {
  notAfter: string;
}

interface ArcaWsaaTicketHeldDetail {
  retryIntervalMinutes: number;
}

interface UpdateRequiredDetail {
  deviceId: string;
  appVersion: string;
}

interface RegisterSilentDetail {
  deviceId: string;
  lastAcceptedPushAt: string;
}

interface SalesDeniedDetail {
  deviceId: string;
  reason: SalesDeniedReason;
}

interface FiscalRejectedDetail {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  rejectionClass: RejectionClass;
  fiscalDocumentId: string;
  saleId: string;
  rejections: TaxAuthorityRejection[];
}

interface ExternalBillingDetail {
  pointOfSale: number;
  documentType: FiscalTaskDocumentType;
  number: number;
}

interface InvoiceAlreadyCreditedDetail {
  pointOfSale: number;
  number: number;
  saleId: string;
}

interface ClockCorrectedDetail {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  previousReading: string;
  correctedReading: string;
  actorId: string;
}

interface OfflineAuthorizationCodeMissingDetail {
  deviceId: string;
  fortnightStart: string;
  fortnightEnd: string;
}

interface LatePaymentRefundDetail {
  saleId: string;
  amount: number;
  providerOrderId: string | null;
}

interface RefundTaskDetail {
  saleId: string;
  amount: number;
  method: string;
  refundOpenedAt: string;
}

interface FiscalUnknownDetail {
  fiscalDocumentId: string;
  saleId: string;
  registerId: string;
  pointOfSale: number;
  number: number;
  unclearSince: string;
}

interface FiscalEmissionStoppedDetail {
  deviceId: string;
  reason: PreEmissionGateFailureReason;
}

interface ClockDriftDetail {
  deviceId: string;
}

interface OutboxChainBrokenDetail {
  deviceId: string;
}

interface LotsExpiringDetail {
  lotCount: number;
  windowDays: number;
}

export type OffsiteDumpUnverifiedDetail =
  | { night: string; reason: Exclude<OffsiteDumpUnverifiedReason, "shrank"> }
  | { night: string; reason: "shrank"; shrinkThresholdPercent: number };

export const FORTNIGHT_REPORT_PENDING_REASONS = [
  "blocked",
  "missing_document",
  "refused",
  "pending",
] as const;

export type FortnightReportPendingReason = (typeof FORTNIGHT_REPORT_PENDING_REASONS)[number];

interface FortnightReportOwedElsewhereDetail {
  pointOfSaleNumber: number;
  fortnightStart: string;
  fortnightEnd: string;
}

interface FortnightReportNeedsRegularizationDetail extends FortnightReportOwedElsewhereDetail {
  registerId: string;
}

interface FortnightReportOverdueDetail extends FortnightReportNeedsRegularizationDetail {
  deadline: string;
}

interface FortnightReportPendingDetail extends FortnightReportOverdueDetail {
  daysLeft: number;
  reason: FortnightReportPendingReason;
}

export interface AlertDetails {
  backoffice_passkey_changed: PasskeyChangedDetail;
  backoffice_recovery_requested: RecoveryRequestedDetail;
  user_email_changed: EmailChangedDetail;
  backoffice_sign_in_lockout: SignInLockoutDetail;
  user_access_increased: AccessIncreasedDetail;
  register_enrolled: RegisterEnrolledDetail;
  events_quarantined: EventsQuarantinedDetail;
  event_invariant_violated: EventInvariantViolatedDetail;
  arca_certificate_expiring: ArcaCertificateExpiringDetail;
  arca_wsaa_ticket_held: ArcaWsaaTicketHeldDetail;
  update_required: UpdateRequiredDetail;
  register_silent: RegisterSilentDetail;
  sales_denied: SalesDeniedDetail;
  fiscal_rejected: FiscalRejectedDetail;
  offline_authorization_code_missing: OfflineAuthorizationCodeMissingDetail;
  late_payment_refund: LatePaymentRefundDetail;
  refund_task: RefundTaskDetail;
  fiscal_unknown: FiscalUnknownDetail;
  fiscal_emission_stopped: FiscalEmissionStoppedDetail;
  clock_drift: ClockDriftDetail;
  outbox_chain_broken: OutboxChainBrokenDetail;
  lots_expiring: LotsExpiringDetail;
  offsite_dump_unverified: OffsiteDumpUnverifiedDetail;
  fortnight_report_pending: FortnightReportPendingDetail;
  fortnight_report_overdue: FortnightReportOverdueDetail;
  external_billing: ExternalBillingDetail;
  fortnight_report_needs_regularization: FortnightReportNeedsRegularizationDetail;
  clock_corrected: ClockCorrectedDetail;
  invoice_already_credited: InvoiceAlreadyCreditedDetail;
  fortnight_report_owed_elsewhere: FortnightReportOwedElsewhereDetail;
}

export type OpenAlertInput = {
  [Kind in AlertKind]: {
    kind: Kind;
    scope: string;
    locationId?: string;
    detail: AlertDetails[Kind];
  };
}[AlertKind];
