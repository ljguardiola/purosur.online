import {
  exceedsRefundable,
  INSUFFICIENT_BALANCE_REFUSAL,
  isProcessedByMercadoPago,
  progressOfRefundAnswer,
  refundIsBackedByItsCancellation,
  refundIsBackedByItsLatePayment,
} from "../model/mercado-pago-refund.js";
import {
  isRefundPending,
  LATE_PAYMENT_REFUND_ORIGIN,
  refundAlertKind,
} from "../model/payment-refund.js";
import type {
  MercadoPagoRefundPorts,
  MercadoPagoRefundRecord,
  MercadoPagoRefundReference,
  MercadoPagoRefundTransaction,
} from "./mercado-pago-refund-ports.js";

export type MercadoPagoRefundAttempt =
  | { kind: "sent"; refundId: string }
  | { kind: "done"; refundId: string; doneAt: Date }
  | { kind: "insufficient_balance"; refundId: string }
  | { kind: "refused"; refundId: string; reason: string }
  | { kind: "provider_unavailable"; refundId: string };

export type LockRefusal = { kind: "not_found" } | { kind: "already_done" };
export type BackingRefusal = { kind: "refund_not_backed" } | { kind: "exceeds_refundable" };

type Located = MercadoPagoRefundRecord & { orderId: string; confirmedBy: string };

export interface Stop<TOutcome> {
  kind: "stop";
  outcome: TOutcome;
}

type Go =
  | { kind: "send"; refund: Located; attemptKey: string }
  | { kind: "read"; refund: Located & { providerRefundId: string } };

export type MercadoPagoRefundPlan<TOutcome> = Stop<TOutcome> | Go;

export async function lockPendingRefund(
  tx: MercadoPagoRefundTransaction,
  reference: MercadoPagoRefundReference,
): Promise<{ kind: "locked"; refund: MercadoPagoRefundRecord } | Stop<LockRefusal>> {
  const refund = await tx.lockMercadoPagoRefund(reference.refundId, reference.locationId);
  if (!refund) {
    return { kind: "stop", outcome: { kind: "not_found" } };
  }
  if (!isRefundPending(refund.state)) {
    return { kind: "stop", outcome: { kind: "already_done" } };
  }
  return { kind: "locked", refund };
}

async function isBackedByItsOrigin(
  tx: MercadoPagoRefundTransaction,
  refund: MercadoPagoRefundRecord,
): Promise<boolean> {
  if (refund.origin === LATE_PAYMENT_REFUND_ORIGIN) {
    return refundIsBackedByItsLatePayment(refund, await tx.latePaymentOfRefund(refund.id));
  }
  const cancellation =
    refund.originEventId === null ? null : await tx.cancellationOfEvent(refund.originEventId);
  return refundIsBackedByItsCancellation(refund, cancellation);
}

export async function planBackedSending(
  tx: MercadoPagoRefundTransaction,
  { refundKeys, clock }: Pick<MercadoPagoRefundPorts, "refundKeys" | "clock">,
  refund: MercadoPagoRefundRecord,
  confirmation: { confirmedBy: string } | null,
): Promise<Stop<BackingRefusal> | Go> {
  if (!(await isBackedByItsOrigin(tx, refund)) || refund.orderId === null) {
    return { kind: "stop", outcome: { kind: "refund_not_backed" } };
  }
  if (exceedsRefundable(refund.amount, refund.paymentAmount, refund.refundedOfPayment)) {
    return { kind: "stop", outcome: { kind: "exceeds_refundable" } };
  }
  const confirmedBy = confirmation?.confirmedBy ?? refund.confirmedBy;
  if (confirmedBy === null) {
    throw new Error(`refund ${refund.id} is sent without a person's confirmation`);
  }
  const located = { ...refund, orderId: refund.orderId, confirmedBy };
  if (confirmation !== null) {
    const attemptKey = refundKeys.newRefundKey();
    await tx.recordRefundConfirmed(refund.id, confirmedBy, clock.now(), attemptKey);
    return { kind: "send", refund: located, attemptKey };
  }
  if (refund.providerRefundId !== null && refund.sentAt !== null) {
    return { kind: "read", refund: { ...located, providerRefundId: refund.providerRefundId } };
  }
  if (refund.attemptKey !== null) {
    return { kind: "send", refund: located, attemptKey: refund.attemptKey };
  }
  const attemptKey = refundKeys.newRefundKey();
  await tx.recordAttemptKey(refund.id, attemptKey);
  return { kind: "send", refund: located, attemptKey };
}

async function markDone(
  tx: MercadoPagoRefundTransaction,
  refund: Located,
  doneAt: Date,
): Promise<MercadoPagoRefundAttempt> {
  await tx.recordRefundDone(refund.id, refund.confirmedBy, doneAt);
  await tx.resolveRefundAlert(
    refund.id,
    refundAlertKind(refund.origin),
    refund.confirmedBy,
    doneAt,
  );
  return { kind: "done", refundId: refund.id, doneAt };
}

async function sendAndRecord(
  { store, mercadoPago, clock }: MercadoPagoRefundPorts,
  refund: Located,
  attemptKey: string,
): Promise<MercadoPagoRefundAttempt> {
  const progress = progressOfRefundAnswer(
    await mercadoPago.refundOrder(refund.orderId, attemptKey),
  );
  const now = clock.now();
  return store.transaction<MercadoPagoRefundAttempt>(async (tx) => {
    await tx.lockMercadoPagoRefund(refund.id, refund.locationId);
    switch (progress.kind) {
      case "done":
        if (progress.providerRefundId !== null) {
          await tx.recordRefundSent(refund.id, progress.providerRefundId, now);
        }
        return markDone(tx, refund, now);
      case "in_process":
        await tx.recordRefundSent(refund.id, progress.providerRefundId, now);
        return { kind: "sent", refundId: refund.id };
      case "waiting_for_balance":
        await tx.recordRefundRefusal(refund.id, INSUFFICIENT_BALANCE_REFUSAL, now);
        await tx.recordAttemptKey(refund.id, null);
        return { kind: "insufficient_balance", refundId: refund.id };
      case "refused":
        await tx.recordRefundRefusal(refund.id, progress.reason, now);
        return { kind: "refused", refundId: refund.id, reason: progress.reason };
      case "unknown":
        return { kind: "provider_unavailable", refundId: refund.id };
    }
  });
}

async function readAndRecord(
  { store, mercadoPago, clock }: MercadoPagoRefundPorts,
  refund: Located & { providerRefundId: string },
): Promise<MercadoPagoRefundAttempt> {
  const reading = await mercadoPago.readOrderRefunds(refund.orderId);
  if (reading.kind === "unavailable") {
    return { kind: "provider_unavailable", refundId: refund.id };
  }
  if (!isProcessedByMercadoPago(reading.refunds, refund.providerRefundId)) {
    return { kind: "sent", refundId: refund.id };
  }
  const now = clock.now();
  return store.transaction<MercadoPagoRefundAttempt>(async (tx) => {
    await tx.lockMercadoPagoRefund(refund.id, refund.locationId);
    return markDone(tx, refund, now);
  });
}

export async function sendMercadoPagoRefund<TOutcome>(
  ports: MercadoPagoRefundPorts,
  paymentTransactionId: string,
  plan: (tx: MercadoPagoRefundTransaction) => Promise<MercadoPagoRefundPlan<TOutcome>>,
): Promise<TOutcome | MercadoPagoRefundAttempt> {
  return ports.lanes.inPaymentTransactionLane<TOutcome | MercadoPagoRefundAttempt>(
    paymentTransactionId,
    async () => {
      const step = await ports.store.transaction(plan);
      switch (step.kind) {
        case "send":
          return sendAndRecord(ports, step.refund, step.attemptKey);
        case "read":
          return readAndRecord(ports, step.refund);
        case "stop":
          return step.outcome;
      }
    },
  );
}
