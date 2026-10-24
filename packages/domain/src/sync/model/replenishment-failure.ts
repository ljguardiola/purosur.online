import { isNewerRegisterVersion, type RegisterVersion } from "../../register/index.js";
import type { ReplenishmentFailureKind } from "../../shared/index.js";

export type ReplenishmentRefusal =
  | "predecessor_not_of_register"
  | "predecessor_not_revoked"
  | "cursor_not_of_replenishment";

export type ReplenishmentFailure =
  | { kind: Extract<ReplenishmentFailureKind, "refused">; refusal: ReplenishmentRefusal }
  | {
      kind: Extract<ReplenishmentFailureKind, "unreadable_event">;
      eventId: string;
      reason: string;
      appVersion: RegisterVersion | null;
    };

export interface PendingReplenishment {
  failure: ReplenishmentFailure | undefined;
}

export type ReplenishmentFailedReport =
  | { replenishment_failed?: undefined }
  | { replenishment_failed: false | ReplenishmentFailureKind };

function isReplenishmentRetryable(
  failure: ReplenishmentFailure,
  currentAppVersion: RegisterVersion | null,
): boolean {
  if (failure.kind === "refused") {
    return false;
  }
  return (
    failure.appVersion !== null &&
    currentAppVersion !== null &&
    isNewerRegisterVersion(failure.appVersion, currentAppVersion)
  );
}

export function heldReplenishmentFailure(
  failure: ReplenishmentFailure | undefined,
  currentAppVersion: RegisterVersion | null,
): ReplenishmentFailure | undefined {
  return failure === undefined || isReplenishmentRetryable(failure, currentAppVersion)
    ? undefined
    : failure;
}

export function replenishmentFailedReportOf(
  pending: PendingReplenishment | undefined,
  currentAppVersion: RegisterVersion | null,
): ReplenishmentFailedReport {
  if (pending === undefined) {
    return { replenishment_failed: false };
  }
  const held = heldReplenishmentFailure(pending.failure, currentAppVersion);
  return held === undefined ? {} : { replenishment_failed: held.kind };
}
