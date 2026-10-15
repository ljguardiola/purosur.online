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

export type SalesDenial = { reason: "event_history_broken" } | StorageSalesStop;

export function salesDenialOf(
  state: SalesStopState,
  storageStop: StorageSalesStop | undefined,
): SalesDenial | undefined {
  if (!state.stopped) {
    return storageStop;
  }
  return state.reason === "event_history_broken" ? { reason: "event_history_broken" } : undefined;
}

export function salesDeniedReportOf(
  state: SalesStopState,
  storageStop?: StorageSalesStop,
): SalesDeniedReport {
  const denial = salesDenialOf(state, storageStop);
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
