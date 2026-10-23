import { isVersionTextNewer } from "./register-version.js";

export type ReplenishmentRefusal =
  | "predecessor_not_of_register"
  | "predecessor_not_revoked"
  | "cursor_not_of_replenishment";

export type ReplenishmentFailure =
  | { kind: "refused"; refusal: ReplenishmentRefusal }
  | { kind: "unreadable_event"; eventId: string; reason: string; appVersion: string | null };

export type ReplenishmentFailedReport =
  | { replenishment_failed?: undefined }
  | { replenishment_failed: false | ReplenishmentFailure["kind"] };

export function isReplenishmentRetryable(
  failure: ReplenishmentFailure,
  currentAppVersion: string | null,
): boolean {
  if (failure.kind === "refused") {
    return false;
  }
  return (
    failure.appVersion !== null &&
    currentAppVersion !== null &&
    isVersionTextNewer(failure.appVersion, currentAppVersion)
  );
}

export function replenishmentFailedReportOf(
  failure: ReplenishmentFailure | undefined,
): ReplenishmentFailedReport {
  return { replenishment_failed: failure === undefined ? false : failure.kind };
}
