import type { SalesDeniedReport } from "../../shared/index.js";
import type { AlertKind } from "./alert-catalog.js";
import type { OpenAlertInput } from "./alert-details.js";

export type AlertConditionObservation =
  | { holds: true; alert: OpenAlertInput }
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
