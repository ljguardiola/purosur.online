import type { Clock } from "../../shared/index.js";
import { isRefundSentByCloud } from "../model/mercado-pago-refund.js";
import { isRefundDiscarded, isRefundPending, refundAlertKind } from "../model/payment-refund.js";
import type { RefundStore } from "./refund-store.js";

export interface MarkRefundDonePorts {
  store: RefundStore;
  clock: Clock;
}

export interface MarkRefundDoneInput {
  refundId: string;
  locationId: string;
  actorId: string;
}

export type MarkRefundDoneOutcome =
  | { kind: "not_found" }
  | { kind: "discarded" }
  | { kind: "already_done" }
  | { kind: "sent_by_cloud" }
  | { kind: "marked_done"; refundId: string; doneAt: Date };

export async function markRefundDone(
  { store, clock }: MarkRefundDonePorts,
  { refundId, locationId, actorId }: MarkRefundDoneInput,
): Promise<MarkRefundDoneOutcome> {
  return store.transaction<MarkRefundDoneOutcome>(async (tx) => {
    const refund = await tx.lockRefund(refundId, locationId);
    if (!refund) {
      return { kind: "not_found" };
    }
    if (isRefundDiscarded(refund.state)) {
      return { kind: "discarded" };
    }
    if (!isRefundPending(refund.state)) {
      return { kind: "already_done" };
    }
    if (isRefundSentByCloud(refund)) {
      return { kind: "sent_by_cloud" };
    }
    const doneAt = clock.now();
    await tx.recordRefundDone(refund.id, actorId, doneAt);
    await tx.resolveRefundAlert(refund.id, refundAlertKind(refund.origin), actorId, doneAt);
    return { kind: "marked_done", refundId: refund.id, doneAt };
  });
}
