import type { ProviderPaymentTransaction } from "../model/payment-transaction.js";
import type { MercadoPagoNotificationPorts } from "./mercado-pago-notification-ports.js";
import { refreshMercadoPagoTransaction } from "./refresh-mercado-pago-transaction.js";

export interface ConfirmMercadoPagoOrderNotificationInput {
  providerOrderId: string;
}

export type ConfirmMercadoPagoOrderNotificationOutcome =
  | { kind: "refreshed"; transaction: ProviderPaymentTransaction }
  | { kind: "unknown_order" }
  | { kind: "provider_unavailable" };

export async function confirmMercadoPagoOrderNotification(
  { directory, lanes, mercadoPago, clock }: MercadoPagoNotificationPorts,
  { providerOrderId }: ConfirmMercadoPagoOrderNotificationInput,
): Promise<ConfirmMercadoPagoOrderNotificationOutcome> {
  const reference = await directory.paymentTransactionOfOrder(providerOrderId);
  if (reference === null) {
    return { kind: "unknown_order" };
  }
  return lanes.inPaymentTransactionLane<ConfirmMercadoPagoOrderNotificationOutcome>(
    reference.id,
    async (lane) => {
      const transaction = await lane.recordedTransaction(reference.registerId, reference.id);
      if (transaction === null) {
        return { kind: "unknown_order" };
      }
      return refreshMercadoPagoTransaction(lane, { mercadoPago, clock }, transaction);
    },
  );
}
