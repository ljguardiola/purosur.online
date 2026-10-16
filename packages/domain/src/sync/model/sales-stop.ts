import type { StorageSalesStop } from "../../register/index.js";
import type { SalesDeniedReport } from "../../shared/index.js";

export const SALES_STOP_REASONS = ["event_history_broken", "installation_revoked"] as const;

export type SalesStopReason = (typeof SALES_STOP_REASONS)[number];

const SALES_STOP_REASON_SET: ReadonlySet<unknown> = new Set(SALES_STOP_REASONS);

export function isSalesStopReason(value: unknown): value is SalesStopReason {
  return SALES_STOP_REASON_SET.has(value);
}

export type SalesStopState =
  | { stopped: false }
  | { stopped: true; reason: SalesStopReason | undefined };

export type SalesDenial =
  | { reason: "event_history_broken" }
  | { reason: "local_database_damaged" }
  | { reason: "battery_critical" }
  | StorageSalesStop;

export function salesDenialOf(
  state: SalesStopState,
  storageStop: StorageSalesStop | undefined,
  localDatabaseDamaged = false,
  batteryCritical = false,
): SalesDenial | undefined {
  if (state.stopped && state.reason === "event_history_broken") {
    return { reason: "event_history_broken" };
  }
  if (state.stopped && state.reason === "installation_revoked") {
    return undefined;
  }
  if (localDatabaseDamaged) {
    return { reason: "local_database_damaged" };
  }
  if (batteryCritical) {
    return { reason: "battery_critical" };
  }
  return state.stopped ? undefined : storageStop;
}

export function salesDeniedReportOf(
  state: SalesStopState,
  storageStop?: StorageSalesStop,
  localDatabaseDamaged = false,
  batteryCritical = false,
): SalesDeniedReport {
  const denial = salesDenialOf(state, storageStop, localDatabaseDamaged, batteryCritical);
  if (denial !== undefined) {
    return { sales_denied: true, sales_denied_reason: denial.reason };
  }
  return state.stopped ? {} : { sales_denied: false };
}

export const SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE: SalesDeniedReport = {
  sales_denied: true,
  sales_denied_reason: "local_database_damaged",
};

export function isInstallationRevoked(state: SalesStopState): boolean {
  return state.stopped && state.reason === "installation_revoked";
}
