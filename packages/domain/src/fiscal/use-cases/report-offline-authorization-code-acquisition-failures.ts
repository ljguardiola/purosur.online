import { offlineAuthorizationCodeAcquisitionLevel } from "../../alerts/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import type {
  FortnightAcquisitionOutcome,
  ObtainOfflineAuthorizationCodesOutcome,
} from "./obtain-offline-authorization-codes.js";
import type {
  AcquisitionFailureReportPorts,
  ReportableAcquisitionFailure,
} from "./report-offline-authorization-code-acquisition-failures-ports.js";

function isReportableFailure(
  outcome: FortnightAcquisitionOutcome,
): outcome is ReportableAcquisitionFailure {
  return (
    outcome.kind === "refused" || outcome.kind === "no_answer" || outcome.kind === "not_recovered"
  );
}

export async function reportOfflineAuthorizationCodeAcquisitionFailures(
  attempt: ObtainOfflineAuthorizationCodesOutcome,
  { store, notifier, clock }: AcquisitionFailureReportPorts,
): Promise<number> {
  if (attempt.kind === "no_offline_point_of_sale") {
    return 0;
  }
  const day = argentinaCalendarDay(clock.now());
  let notified = 0;
  for (const { fortnight, outcome } of attempt.fortnights) {
    if (!isReportableFailure(outcome)) {
      continue;
    }
    const level = offlineAuthorizationCodeAcquisitionLevel(fortnight, day);
    if (level !== "warning" && level !== "critical") {
      continue;
    }
    if (await store.recordFirstReport(fortnight, outcome.kind)) {
      await notifier.failureNeedsAttention({ fortnight, outcome, level });
      notified += 1;
    }
  }
  return notified;
}
