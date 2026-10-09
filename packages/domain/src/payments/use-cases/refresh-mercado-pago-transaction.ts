import type { Clock } from "../../shared/index.js";
import type { ProviderPaymentTransaction } from "../model/payment-transaction.js";
import type { MercadoPagoOrders, PaymentTransactionLane } from "./mercado-pago-qr-order-ports.js";
import { recordExpiryWithoutOrder } from "./record-expiry-without-order.js";
import { recordMercadoPagoOrderResult } from "./record-mercado-pago-order-result.js";

export type MercadoPagoTransactionRefresh =
  | { kind: "refreshed"; transaction: ProviderPaymentTransaction }
  | { kind: "provider_unavailable" };

export async function refreshMercadoPagoTransaction(
  lane: PaymentTransactionLane,
  { mercadoPago, clock }: { mercadoPago: MercadoPagoOrders; clock: Clock },
  transaction: ProviderPaymentTransaction,
): Promise<MercadoPagoTransactionRefresh> {
  const ended = await recordExpiryWithoutOrder(lane, transaction, clock.now());
  if (ended !== null) {
    return { kind: "refreshed", transaction: ended };
  }
  if (transaction.state !== "PENDING" || transaction.providerOrderId === null) {
    return { kind: "refreshed", transaction };
  }

  const reading = await mercadoPago.readOrder(transaction.providerOrderId);
  if (reading.kind === "unavailable") {
    return { kind: "provider_unavailable" };
  }
  return {
    kind: "refreshed",
    transaction: await recordMercadoPagoOrderResult(lane, transaction, reading.result, clock.now()),
  };
}
