import { isMercadoPagoOrderAtTerminal } from "../model/mercado-pago-order-result.js";
import {
  type MercadoPagoOrderTransaction,
  PENDING_PAYMENT_TRANSACTION_STATE,
} from "../model/payment-transaction.js";
import {
  type MercadoPagoCancellationKeys,
  type MercadoPagoOrderPorts,
  PaymentTransactionAlreadyRecorded,
  type PaymentTransactionLane,
} from "./mercado-pago-order-ports.js";
import { recordMercadoPagoOrderResult } from "./record-mercado-pago-order-result.js";
import { refreshMercadoPagoTransaction } from "./refresh-mercado-pago-transaction.js";

export interface CancelMercadoPagoOrderInput {
  registerId: string;
  paymentTransactionId: string;
  saleId: string;
  amount: number;
  provider: MercadoPagoOrderTransaction["provider"];
}

export type MercadoPagoOrderCancellationOutcome =
  | { kind: "cancelled"; transaction: MercadoPagoOrderTransaction }
  | { kind: "approved"; transaction: MercadoPagoOrderTransaction }
  | { kind: "already_closed"; transaction: MercadoPagoOrderTransaction }
  | { kind: "cancel_on_terminal"; transaction: MercadoPagoOrderTransaction }
  | { kind: "provider_unavailable" };

export type CancelMercadoPagoOrderOutcome =
  | MercadoPagoOrderCancellationOutcome
  | { kind: "not_found" };

type Ports = Pick<MercadoPagoOrderPorts, "mercadoPago" | "clock">;

export type CancelMercadoPagoOrderPorts = MercadoPagoOrderPorts & {
  cancellationKeys: MercadoPagoCancellationKeys;
};

type LanePorts = Ports & { cancellationKeys: MercadoPagoCancellationKeys };

function outcomeOfClosed(
  transaction: MercadoPagoOrderTransaction,
  cancelledNow: boolean,
): MercadoPagoOrderCancellationOutcome {
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
  transaction: MercadoPagoOrderTransaction,
  providerOrderId: string,
): Promise<MercadoPagoOrderCancellationOutcome> {
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
      const recorded = await recordMercadoPagoOrderResult(
        lane,
        transaction,
        reading.result,
        clock.now(),
      );
      if (recorded.method === "POINT" && isMercadoPagoOrderAtTerminal(reading.result)) {
        return { kind: "cancel_on_terminal", transaction: recorded };
      }
      return outcomeOfClosed(recorded, false);
    }
    case "unavailable":
      return { kind: "provider_unavailable" };
  }
}

export async function cancelMercadoPagoOrderInLane(
  lane: PaymentTransactionLane,
  ports: LanePorts,
  recorded: MercadoPagoOrderTransaction,
): Promise<MercadoPagoOrderCancellationOutcome> {
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

async function recordCancelledWithoutOrder(
  lane: PaymentTransactionLane,
  { registerId, paymentTransactionId, saleId, amount, provider }: CancelMercadoPagoOrderInput,
  now: Date,
): Promise<CancelMercadoPagoOrderOutcome> {
  const transaction: MercadoPagoOrderTransaction = {
    id: paymentTransactionId,
    registerId,
    saleId,
    kind: "SALE",
    ...(provider === "MERCADOPAGO_POINT"
      ? ({ method: "POINT", provider } as const)
      : ({ method: "QR", provider } as const)),
    amount,
    state: "CANCELLED",
    needsReview: false,
    providerOrderId: null,
    creationOutcomeUnknown: false,
    replaced: false,
    createdAt: now,
    expiresAt: now,
  };
  try {
    await lane.recordCancelledWithoutOrder(transaction);
  } catch (error) {
    if (error instanceof PaymentTransactionAlreadyRecorded) {
      return { kind: "not_found" };
    }
    throw error;
  }
  return { kind: "cancelled", transaction };
}

export async function cancelMercadoPagoOrder(
  { lanes, mercadoPago, clock, cancellationKeys }: CancelMercadoPagoOrderPorts,
  input: CancelMercadoPagoOrderInput,
): Promise<CancelMercadoPagoOrderOutcome> {
  const { registerId, paymentTransactionId } = input;
  return lanes.inPaymentTransactionLane<CancelMercadoPagoOrderOutcome>(
    paymentTransactionId,
    async (lane) => {
      const transaction = await lane.recordedTransaction(registerId, paymentTransactionId);
      if (transaction === null) {
        return recordCancelledWithoutOrder(lane, input, clock.now());
      }
      return cancelMercadoPagoOrderInLane(
        lane,
        { mercadoPago, clock, cancellationKeys },
        transaction,
      );
    },
  );
}
