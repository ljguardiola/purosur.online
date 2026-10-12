import type { MercadoPagoOrderTransaction } from "../model/payment-transaction.js";
import type { MercadoPagoOrderPorts } from "./mercado-pago-order-ports.js";
import { refreshMercadoPagoTransaction } from "./refresh-mercado-pago-transaction.js";

export interface ReadMercadoPagoOrderPaymentInput {
  registerId: string;
  paymentTransactionId: string;
}

export type ReadMercadoPagoOrderPaymentOutcome =
  | { kind: "read"; transaction: MercadoPagoOrderTransaction }
  | { kind: "not_found" }
  | { kind: "provider_unavailable" };

export async function readMercadoPagoOrderPayment(
  { lanes, mercadoPago, clock }: MercadoPagoOrderPorts,
  { registerId, paymentTransactionId }: ReadMercadoPagoOrderPaymentInput,
): Promise<ReadMercadoPagoOrderPaymentOutcome> {
  return lanes.inPaymentTransactionLane<ReadMercadoPagoOrderPaymentOutcome>(
    paymentTransactionId,
    async (lane) => {
      const transaction = await lane.recordedTransaction(registerId, paymentTransactionId);
      if (transaction === null) {
        return { kind: "not_found" };
      }
      const refresh = await refreshMercadoPagoTransaction(
        lane,
        { mercadoPago, clock },
        transaction,
      );
      return refresh.kind === "refreshed"
        ? { kind: "read", transaction: refresh.transaction }
        : refresh;
    },
  );
}
