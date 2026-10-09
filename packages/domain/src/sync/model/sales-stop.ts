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

export function salesDeniedReportOf(state: SalesStopState): SalesDeniedReport {
  if (!state.stopped) {
    return { sales_denied: false };
  }
  if (state.reason === "event_history_broken") {
    return { sales_denied: true, sales_denied_reason: "event_history_broken" };
  }
  return {};
}

export function isInstallationRevoked(state: SalesStopState): boolean {
  return state.stopped && state.reason === "installation_revoked";
}
