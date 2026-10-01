import type { AlertKind } from "../model/alert-catalog.js";
import { alertKindPolicy } from "../model/alert-kind-policy.js";
import { isOpenAlert } from "../model/open-alert-state.js";
import type { AlertClosingPorts, LockedAlert } from "./alert-store.js";

export interface CloseAlertInput {
  alertId: string;
  closedBy: string;
}

export interface ClosedAlert {
  alertId: string;
  kind: AlertKind;
  scope: string;
  detail: Record<string, unknown>;
  closedAt: Date;
  closedBy: string;
}

export type CloseAlertOutcome =
  | { kind: "not_found" }
  | { kind: "already_closed" }
  | { kind: "closed"; alert: ClosedAlert };

export async function closeAlert(
  { store, clock, hasher }: AlertClosingPorts,
  input: CloseAlertInput,
): Promise<CloseAlertOutcome> {
  return store.transaction<CloseAlertOutcome>(async (tx) => {
    const alert = await tx.lockAlert(input.alertId);
    if (!alert) {
      return { kind: "not_found" };
    }
    if (!isOpenAlert(alert)) {
      return { kind: "already_closed" };
    }

    const closedAt = clock.now();
    const kept = keptAfterClosure(alert, (address) => hasher.hash(address));
    await tx.recordClosure(input.alertId, { closedAt, closedBy: input.closedBy, ...kept });
    return {
      kind: "closed",
      alert: {
        alertId: input.alertId,
        kind: alert.kind,
        ...kept,
        closedAt,
        closedBy: input.closedBy,
      },
    };
  });
}

function keptAfterClosure(
  alert: LockedAlert,
  hash: (address: string) => string,
): Pick<LockedAlert, "scope" | "detail"> {
  if (alertKindPolicy(alert.kind).scopeKind !== "sourceAddress") {
    return { scope: alert.scope, detail: alert.detail };
  }
  const { sourceAddress } = alert.detail;
  return {
    scope: hash(alert.scope),
    detail: {
      ...alert.detail,
      ...(typeof sourceAddress === "string" ? { sourceAddress: hash(sourceAddress) } : {}),
    },
  };
}
