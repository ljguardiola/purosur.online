import type { MercadoPagoNotificationPorts } from "./mercado-pago-notification-ports.js";
import { refreshMercadoPagoTransaction } from "./refresh-mercado-pago-transaction.js";

export interface CheckPendingMercadoPagoPaymentsOutcome {
  kind: "checked";
  refreshed: number;
  unavailable: number;
}

export async function checkPendingMercadoPagoPayments({
  directory,
  lanes,
  mercadoPago,
  clock,
}: MercadoPagoNotificationPorts): Promise<CheckPendingMercadoPagoPaymentsOutcome> {
  let refreshed = 0;
  let unavailable = 0;
  for (const reference of await directory.pendingPaymentTransactions()) {
    const refresh = await lanes.inPaymentTransactionLane(reference.id, async (lane) => {
      const transaction = await lane.recordedTransaction(reference.registerId, reference.id);
      return transaction === null
        ? null
        : refreshMercadoPagoTransaction(lane, { mercadoPago, clock }, transaction);
    });
    if (refresh?.kind === "refreshed") {
      refreshed += 1;
    } else if (refresh?.kind === "provider_unavailable") {
      unavailable += 1;
    }
  }
  return { kind: "checked", refreshed, unavailable };
}
