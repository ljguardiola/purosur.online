import type { Clock } from "../../shared/index.js";
import { isRefundRefusedForGood } from "../model/mercado-pago-refund.js";
import { isRefundDiscarded, isRefundPending, refundAlertKind } from "../model/payment-refund.js";
import type { RefundTransfer } from "../model/refund-transfer.js";
import type { RefundStore } from "./refund-store.js";

export interface RecordRefundTransferPorts {
  store: RefundStore;
  clock: Clock;
}

export interface RecordRefundTransferInput {
  refundId: string;
  locationId: string;
  actorId: string;
  transfer: RefundTransfer;
}

export type RecordRefundTransferOutcome =
  | { kind: "not_found" }
  | { kind: "discarded" }
  | { kind: "already_done" }
  | { kind: "not_refused_for_good" }
  | { kind: "refunded_by_transfer"; refundId: string; doneAt: Date };

export async function recordRefundTransfer(
  { store, clock }: RecordRefundTransferPorts,
  { refundId, locationId, actorId, transfer }: RecordRefundTransferInput,
): Promise<RecordRefundTransferOutcome> {
  return store.transaction<RecordRefundTransferOutcome>(async (tx) => {
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
    if (!isRefundRefusedForGood(refund)) {
      return { kind: "not_refused_for_good" };
    }
    const doneAt = clock.now();
    await tx.recordRefundDoneByTransfer(refund.id, transfer, actorId, doneAt);
    await tx.resolveRefundAlert(refund.id, refundAlertKind(refund.origin), actorId, doneAt);
    return { kind: "refunded_by_transfer", refundId: refund.id, doneAt };
  });
}
