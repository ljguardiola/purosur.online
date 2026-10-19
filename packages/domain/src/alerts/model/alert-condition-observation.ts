import { OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT } from "../../backups/index.js";
import {
  FACTURA_C_DOCUMENT_TYPE,
  type FiscalDocumentType,
  type FiscalEmissionStoppedReport,
  type FiscalTaskDocumentType,
  type Fortnight,
  type RejectionStandingChange,
} from "../../fiscal/index.js";
import type { SalesDeniedReport } from "../../shared/index.js";
import type { AlertKind, AlertLevel } from "./alert-catalog.js";
import type { AlertDetails, OpenAlertInput } from "./alert-details.js";
import type { OffsiteDumpUnverifiedReason } from "./offsite-dump-unverified-reason.js";
import { registerFortnightScope } from "./register-fortnight-scope.js";

export type AlertConditionObservation =
  | { holds: true; alert: OpenAlertInput; level?: AlertLevel }
  | { holds: false; kind: AlertKind; scope: string };

interface QuietRegister {
  registerId: string;
  deviceId: string;
  locationId: string;
  lastSuccessfulSyncAt: Date;
}

export function quietRegisterObservation({
  registerId,
  deviceId,
  locationId,
  lastSuccessfulSyncAt,
}: QuietRegister): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "register_silent",
      scope: registerId,
      locationId,
      detail: { deviceId, lastAcceptedPushAt: lastSuccessfulSyncAt.toISOString() },
    },
  };
}

export function registerSyncedObservation(registerId: string): AlertConditionObservation {
  return { holds: false, kind: "register_silent", scope: registerId };
}

interface RegisterVersionStanding {
  registerId: string;
  deviceId: string;
  appVersion: string;
  accepted: boolean;
}

export function registerVersionObservation({
  registerId,
  deviceId,
  appVersion,
  accepted,
}: RegisterVersionStanding): AlertConditionObservation {
  if (accepted) {
    return { holds: false, kind: "update_required", scope: registerId };
  }
  return {
    holds: true,
    alert: { kind: "update_required", scope: registerId, detail: { deviceId, appVersion } },
  };
}

interface RegisterSalesStanding {
  registerId: string;
  deviceId: string;
  locationId: string;
  report: SalesDeniedReport;
}

export function registerSalesDeniedObservation({
  registerId,
  deviceId,
  locationId,
  report,
}: RegisterSalesStanding): AlertConditionObservation | undefined {
  if (report.sales_denied === undefined) {
    return undefined;
  }
  if (!report.sales_denied) {
    return { holds: false, kind: "sales_denied", scope: registerId };
  }
  return {
    holds: true,
    alert: {
      kind: "sales_denied",
      scope: registerId,
      locationId,
      detail: { deviceId, reason: report.sales_denied_reason },
    },
  };
}

interface RegisterFiscalEmissionStanding {
  registerId: string;
  deviceId: string;
  locationId: string;
  report: FiscalEmissionStoppedReport;
}

export function registerFiscalEmissionObservation({
  registerId,
  deviceId,
  locationId,
  report,
}: RegisterFiscalEmissionStanding): AlertConditionObservation | undefined {
  if (report.fiscal_emission_stopped === undefined) {
    return undefined;
  }
  if (!report.fiscal_emission_stopped) {
    return { holds: false, kind: "fiscal_emission_stopped", scope: registerId };
  }
  return {
    holds: true,
    alert: {
      kind: "fiscal_emission_stopped",
      scope: registerId,
      locationId,
      detail: { deviceId, reason: report.fiscal_emission_stopped_reason },
    },
  };
}

type FiscalRejection = Extract<RejectionStandingChange, { kind: "open" }>;

function fiscalRejectedScope(pointOfSale: number, documentType: FiscalDocumentType): string {
  return `${pointOfSale}:${documentType}`;
}

export function fiscalRejectionObservation({
  pointOfSale,
  documentType,
  rejectionClass,
  fiscalDocumentId,
  saleId,
  rejections,
}: Omit<FiscalRejection, "kind">): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "fiscal_rejected",
      scope: fiscalRejectedScope(pointOfSale, documentType),
      detail: {
        pointOfSale,
        documentType,
        rejectionClass,
        fiscalDocumentId,
        saleId,
        rejections: [...rejections],
      },
    },
  };
}

export function clockCorrectedObservation({
  registerId,
  locationId,
  ...detail
}: {
  registerId: string;
  locationId: string;
} & AlertDetails["clock_corrected"]): AlertConditionObservation {
  return {
    holds: true,
    alert: { kind: "clock_corrected", scope: registerId, locationId, detail },
  };
}

export function externalBillingObservation({
  pointOfSale,
  documentType,
  number,
}: {
  pointOfSale: number;
  documentType: FiscalTaskDocumentType;
  number: number;
}): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "external_billing",
      scope: [pointOfSale, documentType, number].join(":"),
      detail: { pointOfSale, documentType, number },
    },
  };
}

export function invoiceAlreadyCreditedObservation({
  pointOfSale,
  number,
  saleId,
}: {
  pointOfSale: number;
  number: number;
  saleId: string;
}): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "invoice_already_credited",
      scope: [pointOfSale, FACTURA_C_DOCUMENT_TYPE, number].join(":"),
      detail: { pointOfSale, number, saleId },
    },
  };
}

export function fiscalDocumentAuthorizedObservation({
  pointOfSale,
  documentType,
}: {
  pointOfSale: number;
  documentType: FiscalDocumentType;
}): AlertConditionObservation {
  return {
    holds: false,
    kind: "fiscal_rejected",
    scope: fiscalRejectedScope(pointOfSale, documentType),
  };
}

export function fiscalRejectionAlertObservation(
  change: RejectionStandingChange,
): AlertConditionObservation {
  return change.kind === "open"
    ? fiscalRejectionObservation(change)
    : fiscalDocumentAuthorizedObservation(change);
}

interface MissingOfflineAuthorizationCode {
  registerId: string;
  deviceId: string;
  fortnight: Fortnight;
  level: AlertLevel;
}

export function offlineAuthorizationCodeMissingObservation({
  registerId,
  deviceId,
  fortnight,
  level,
}: MissingOfflineAuthorizationCode): AlertConditionObservation {
  return {
    holds: true,
    level,
    alert: {
      kind: "offline_authorization_code_missing",
      scope: registerFortnightScope(registerId, fortnight.start),
      detail: { deviceId, fortnightStart: fortnight.start, fortnightEnd: fortnight.end },
    },
  };
}

export function offlineAuthorizationCodeHeldObservation(scope: string): AlertConditionObservation {
  return { holds: false, kind: "offline_authorization_code_missing", scope };
}

export function lotsExpiringObservation({
  locationId,
  lotCount,
  windowDays,
}: {
  locationId: string;
  lotCount: number;
  windowDays: number;
}): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "lots_expiring",
      scope: locationId,
      locationId,
      detail: { lotCount, windowDays },
    },
  };
}

export function lotsNoLongerExpiringObservation(scope: string): AlertConditionObservation {
  return { holds: false, kind: "lots_expiring", scope };
}

export function offsiteDumpUnverifiedObservation({
  environment,
  night,
  reason,
}: {
  environment: string;
  night: string;
  reason: OffsiteDumpUnverifiedReason;
}): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "offsite_dump_unverified",
      scope: environment,
      detail:
        reason === "shrank"
          ? { night, reason, shrinkThresholdPercent: OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT }
          : { night, reason },
    },
  };
}

export function offsiteDumpVerifiedObservation(environment: string): AlertConditionObservation {
  return { holds: false, kind: "offsite_dump_unverified", scope: environment };
}
