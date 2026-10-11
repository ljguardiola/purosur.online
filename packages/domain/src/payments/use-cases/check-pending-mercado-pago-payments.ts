import { cancelMercadoPagoQrOrderInLane } from "./cancel-mercado-pago-qr-order.js";
import type { MercadoPagoNotificationPorts } from "./mercado-pago-notification-ports.js";
import { refreshMercadoPagoTransaction } from "./refresh-mercado-pago-transaction.js";

export interface CheckPendingMercadoPagoPaymentsOutcome {
  kind: "checked";
  refreshed: number;
  unavailable: number;
}

function settled(
  outcome: Awaited<ReturnType<typeof cancelMercadoPagoQrOrderInLane>>,
): { kind: "refreshed" } | { kind: "provider_unavailable" } {
  return outcome.kind === "provider_unavailable" ? outcome : { kind: "refreshed" };
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
      if (transaction === null) {
        return null;
      }
      const ports = { mercadoPago, clock };
      return transaction.replaced
        ? settled(await cancelMercadoPagoQrOrderInLane(lane, ports, transaction))
        : refreshMercadoPagoTransaction(lane, ports, transaction);
    });
    if (refresh?.kind === "refreshed") {
      refreshed += 1;
    } else if (refresh?.kind === "provider_unavailable") {
      unavailable += 1;
    }
  }
  return { kind: "checked", refreshed, unavailable };
}
