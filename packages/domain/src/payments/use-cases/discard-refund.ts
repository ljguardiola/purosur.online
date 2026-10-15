import type { Clock } from "../../shared/index.js";
import {
  isRefundDiscarded,
  isRefundOriginDiscardable,
  isRefundPending,
  refundAlertKind,
} from "../model/payment-refund.js";
import type { RefundStore } from "./refund-store.js";

export interface DiscardRefundPorts {
  store: RefundStore;
  clock: Clock;
}

export interface DiscardRefundInput {
  refundId: string;
  locationId: string;
  actorId: string;
}

export type DiscardRefundOutcome =
  | { kind: "not_found" }
  | { kind: "not_discardable" }
  | { kind: "already_done" }
  | { kind: "already_discarded" }
  | { kind: "already_confirmed" }
  | { kind: "discarded"; refundId: string; discardedAt: Date };

export async function discardRefund(
  { store, clock }: DiscardRefundPorts,
  { refundId, locationId, actorId }: DiscardRefundInput,
): Promise<DiscardRefundOutcome> {
  return store.transaction<DiscardRefundOutcome>(async (tx) => {
    const refund = await tx.lockRefund(refundId, locationId);
    if (!refund) {
      return { kind: "not_found" };
    }
    if (!isRefundOriginDiscardable(refund.origin)) {
      return { kind: "not_discardable" };
    }
    if (isRefundDiscarded(refund.state)) {
      return { kind: "already_discarded" };
    }
    if (!isRefundPending(refund.state)) {
      return { kind: "already_done" };
    }
    if (refund.confirmedAt !== null) {
      return { kind: "already_confirmed" };
    }
    const discardedAt = clock.now();
    await tx.recordRefundDiscarded(refund.id, actorId, discardedAt);
    await tx.resolveRefundAlert(refund.id, refundAlertKind(refund.origin), actorId, discardedAt);
    return { kind: "discarded", refundId: refund.id, discardedAt };
  });
}
