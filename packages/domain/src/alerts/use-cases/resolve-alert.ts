import { isOpenAlert } from "../model/open-alert-state.js";
import { alertEmailRecorder } from "./alert-email-recorder.js";
import type { AlertClosingPorts } from "./alert-store.js";
import { keptAfterClosure } from "./kept-after-closure.js";

export type ResolveAlertOutcome =
  | { kind: "not_found" }
  | { kind: "already_resolved" }
  | { kind: "resolved" };

export async function resolveAlert(
  { store, clock, hasher }: AlertClosingPorts,
  alertId: string,
): Promise<ResolveAlertOutcome> {
  return store.transaction<ResolveAlertOutcome>(async (tx) => {
    const alert = await tx.lockAlert(alertId);
    if (!alert) {
      return { kind: "not_found" };
    }
    if (!isOpenAlert(alert)) {
      return { kind: "already_resolved" };
    }
    const kept = keptAfterClosure(alert, (address) => hasher.hash(address));
    const closedAt = clock.now();
    await tx.recordClosure(alertId, { closedAt, closedBy: null, ...kept });
    await alertEmailRecorder(tx)(
      { alertId, kind: alert.kind, locationId: alert.locationId },
      "resolved",
      alert.level,
      closedAt,
    );
    return { kind: "resolved" };
  });
}
