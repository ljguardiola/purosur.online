import {
  type MercadoPagoQrOrderTransaction,
  PENDING_PAYMENT_TRANSACTION_STATE,
} from "../model/payment-transaction.js";
import type {
  MercadoPagoCancellationKeys,
  MercadoPagoQrOrderPorts,
  PaymentTransactionLane,
} from "./mercado-pago-qr-order-ports.js";
import { recordMercadoPagoOrderResult } from "./record-mercado-pago-order-result.js";
import { refreshMercadoPagoTransaction } from "./refresh-mercado-pago-transaction.js";

export interface CancelMercadoPagoQrOrderInput {
  registerId: string;
  paymentTransactionId: string;
}

export type MercadoPagoQrOrderCancellationOutcome =
  | { kind: "cancelled"; transaction: MercadoPagoQrOrderTransaction }
  | { kind: "approved"; transaction: MercadoPagoQrOrderTransaction }
  | { kind: "already_closed"; transaction: MercadoPagoQrOrderTransaction }
  | { kind: "provider_unavailable" };

export type CancelMercadoPagoQrOrderOutcome =
  | MercadoPagoQrOrderCancellationOutcome
  | { kind: "not_found" };

type Ports = Pick<MercadoPagoQrOrderPorts, "mercadoPago" | "clock">;

export type CancelMercadoPagoQrOrderPorts = MercadoPagoQrOrderPorts & {
  cancellationKeys: MercadoPagoCancellationKeys;
};

type LanePorts = Ports & { cancellationKeys: MercadoPagoCancellationKeys };

function outcomeOfClosed(
  transaction: MercadoPagoQrOrderTransaction,
  cancelledNow: boolean,
): MercadoPagoQrOrderCancellationOutcome {
  switch (transaction.state) {
    case "PENDING":
      return { kind: "provider_unavailable" };
    case "APPROVED":
      return { kind: "approved", transaction };
    case "CANCELLED":
      return cancelledNow
        ? { kind: "cancelled", transaction }
        : { kind: "already_closed", transaction };
    default:
      return { kind: "already_closed", transaction };
  }
}

async function cancelOrder(
  lane: PaymentTransactionLane,
  { mercadoPago, clock, cancellationKeys }: LanePorts,
  transaction: MercadoPagoQrOrderTransaction,
  providerOrderId: string,
): Promise<MercadoPagoQrOrderCancellationOutcome> {
  const cancellation = await mercadoPago.cancelOrder(
    providerOrderId,
    cancellationKeys.newCancellationKey(),
  );
  switch (cancellation.kind) {
    case "cancelled":
      return outcomeOfClosed(
        await recordMercadoPagoOrderResult(lane, transaction, cancellation.result, clock.now()),
        true,
      );
    case "cannot_cancel": {
      const reading = await mercadoPago.readOrder(providerOrderId);
      if (reading.kind === "unavailable") {
        return { kind: "provider_unavailable" };
      }
      return outcomeOfClosed(
        await recordMercadoPagoOrderResult(lane, transaction, reading.result, clock.now()),
        false,
      );
    }
    case "unavailable":
      return { kind: "provider_unavailable" };
  }
}

export async function cancelMercadoPagoQrOrderInLane(
  lane: PaymentTransactionLane,
  ports: LanePorts,
  recorded: MercadoPagoQrOrderTransaction,
): Promise<MercadoPagoQrOrderCancellationOutcome> {
  const refresh = await refreshMercadoPagoTransaction(lane, ports, recorded);
  if (refresh.kind === "provider_unavailable") {
    return refresh;
  }
  const { transaction } = refresh;
  if (transaction.state !== PENDING_PAYMENT_TRANSACTION_STATE) {
    return outcomeOfClosed(transaction, false);
  }
  if (transaction.providerOrderId === null) {
    return { kind: "provider_unavailable" };
  }
  return cancelOrder(lane, ports, transaction, transaction.providerOrderId);
}

export async function cancelMercadoPagoQrOrder(
  { lanes, mercadoPago, clock, cancellationKeys }: CancelMercadoPagoQrOrderPorts,
  { registerId, paymentTransactionId }: CancelMercadoPagoQrOrderInput,
): Promise<CancelMercadoPagoQrOrderOutcome> {
  return lanes.inPaymentTransactionLane<CancelMercadoPagoQrOrderOutcome>(
    paymentTransactionId,
    async (lane) => {
      const transaction = await lane.recordedTransaction(registerId, paymentTransactionId);
      if (transaction === null) {
        return { kind: "not_found" };
      }
      return cancelMercadoPagoQrOrderInLane(
        lane,
        { mercadoPago, clock, cancellationKeys },
        transaction,
      );
    },
  );
}
