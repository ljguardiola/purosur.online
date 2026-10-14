import { isRefundSentByCloud } from "../model/mercado-pago-refund.js";
import type { MercadoPagoRefundPorts } from "./mercado-pago-refund-ports.js";
import {
  type BackingRefusal,
  type LockRefusal,
  lockPendingRefund,
  type MercadoPagoRefundAttempt,
  planBackedSending,
  sendMercadoPagoRefund,
} from "./send-mercado-pago-refund.js";

export interface ConfirmMercadoPagoRefundInput {
  refundId: string;
  locationId: string;
  actorId: string;
}

export type ConfirmMercadoPagoRefundOutcome =
  | LockRefusal
  | BackingRefusal
  | { kind: "not_confirmable" }
  | { kind: "already_confirmed" }
  | MercadoPagoRefundAttempt;

export async function confirmMercadoPagoRefund(
  ports: MercadoPagoRefundPorts,
  { refundId, locationId, actorId }: ConfirmMercadoPagoRefundInput,
): Promise<ConfirmMercadoPagoRefundOutcome> {
  const reference = await ports.store.refundReference(refundId, locationId);
  if (!reference) {
    return { kind: "not_found" };
  }
  if (!isRefundSentByCloud(reference) || reference.paymentTransactionId === null) {
    return { kind: "not_confirmable" };
  }
  return sendMercadoPagoRefund<ConfirmMercadoPagoRefundOutcome>(
    ports,
    reference.paymentTransactionId,
    async (tx) => {
      const locked = await lockPendingRefund(tx, reference);
      if (locked.kind !== "locked") {
        return locked;
      }
      if (locked.refund.confirmedAt !== null) {
        return { kind: "stop", outcome: { kind: "already_confirmed" } };
      }
      return planBackedSending(tx, ports, locked.refund, { confirmedBy: actorId });
    },
  );
}
