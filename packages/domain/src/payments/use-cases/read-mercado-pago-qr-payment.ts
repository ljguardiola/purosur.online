import type { ProviderPaymentTransaction } from "../model/payment-transaction.js";
import type { MercadoPagoQrOrderPorts } from "./mercado-pago-qr-order-ports.js";
import { recordExpiryWithoutOrder } from "./record-expiry-without-order.js";
import { recordMercadoPagoOrderResult } from "./record-mercado-pago-order-result.js";

export interface ReadMercadoPagoQrPaymentInput {
  registerId: string;
  paymentTransactionId: string;
}

export type ReadMercadoPagoQrPaymentOutcome =
  | { kind: "read"; transaction: ProviderPaymentTransaction }
  | { kind: "not_found" }
  | { kind: "provider_unavailable" };

export async function readMercadoPagoQrPayment(
  { lanes, mercadoPago, clock }: MercadoPagoQrOrderPorts,
  { registerId, paymentTransactionId }: ReadMercadoPagoQrPaymentInput,
): Promise<ReadMercadoPagoQrPaymentOutcome> {
  return lanes.inPaymentTransactionLane<ReadMercadoPagoQrPaymentOutcome>(
    paymentTransactionId,
    async (lane) => {
      const transaction = await lane.recordedTransaction(registerId, paymentTransactionId);
      if (transaction === null) {
        return { kind: "not_found" };
      }
      const ended = await recordExpiryWithoutOrder(lane, transaction, clock.now());
      if (ended !== null) {
        return { kind: "read", transaction: ended };
      }
      if (transaction.state !== "PENDING" || transaction.providerOrderId === null) {
        return { kind: "read", transaction };
      }

      const reading = await mercadoPago.readOrder(transaction.providerOrderId);
      if (reading.kind === "unavailable") {
        return { kind: "provider_unavailable" };
      }
      return {
        kind: "read",
        transaction: await recordMercadoPagoOrderResult(
          lane,
          transaction,
          reading.result,
          clock.now(),
        ),
      };
    },
  );
}
