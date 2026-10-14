import { isAwaitingMercadoPago, isRefundSentByCloud } from "../model/mercado-pago-refund.js";
import type { MercadoPagoRefundPorts } from "./mercado-pago-refund-ports.js";
import {
  type BackingRefusal,
  type LockRefusal,
  lockPendingRefund,
  type MercadoPagoRefundAttempt,
  planBackedSending,
  sendMercadoPagoRefund,
} from "./send-mercado-pago-refund.js";

export interface FollowMercadoPagoRefundsOutcome {
  kind: "followed";
  followed: number;
  done: number;
  unavailable: number;
}

export async function followMercadoPagoRefunds(
  ports: MercadoPagoRefundPorts,
): Promise<FollowMercadoPagoRefundsOutcome> {
  let followed = 0;
  let done = 0;
  let unavailable = 0;
  for (const reference of await ports.store.confirmedPendingRefunds()) {
    if (
      !isRefundSentByCloud(reference) ||
      !isAwaitingMercadoPago(reference) ||
      reference.paymentTransactionId === null
    ) {
      continue;
    }
    const sending = await sendMercadoPagoRefund<
      | LockRefusal
      | BackingRefusal
      | { kind: "not_awaiting_mercado_pago" }
      | MercadoPagoRefundAttempt
    >(ports, reference.paymentTransactionId, async (tx) => {
      const locked = await lockPendingRefund(tx, reference);
      if (locked.kind !== "locked") {
        return locked;
      }
      if (!isAwaitingMercadoPago(locked.refund)) {
        return { kind: "stop", outcome: { kind: "not_awaiting_mercado_pago" } };
      }
      return planBackedSending(tx, ports, locked.refund, null);
    });
    if (
      sending.kind === "not_found" ||
      sending.kind === "already_done" ||
      sending.kind === "not_awaiting_mercado_pago"
    ) {
      continue;
    }
    followed += 1;
    if (sending.kind === "done") {
      done += 1;
    } else if (sending.kind === "provider_unavailable") {
      unavailable += 1;
    }
  }
  return { kind: "followed", followed, done, unavailable };
}
