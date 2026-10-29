import {
  aMercadoPagoChargeInProgress,
  cancellableWithoutAuthorization,
} from "../../payments/index.js";
import type { Clock } from "../../shared/index.js";
import type { RegisterRestoration } from "./register-restoration.js";
import { saleCancelledEvent } from "./sale-cancelled-event.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface CancelSaleInput {
  actorId: string;
}

export interface CancelSalePorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  ids: IdGenerator;
}

export type CancelSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "has_approved_payment" }
  | { kind: "mercado_pago_charge_in_progress" }
  | { kind: "unavailable" }
  | { kind: "cancelled" };

export function cancelSale(
  { ledger, restoration, clock, ids }: CancelSalePorts,
  { actorId }: CancelSaleInput,
): CancelSaleOutcome {
  return ledger.transaction<CancelSaleOutcome>((tx) => {
    const session = sellingSession(tx, actorId, restoration);
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    if (!sale) {
      return { kind: "no_open_sale" };
    }
    if (!cancellableWithoutAuthorization(tx.salePayments(sale.id))) {
      return { kind: "has_approved_payment" };
    }

    const pendingMercadoPagoPayments = tx.pendingMercadoPagoPaymentsOf(sale.id);
    const now = clock.now();
    if (aMercadoPagoChargeInProgress(pendingMercadoPagoPayments, now)) {
      return { kind: "mercado_pago_charge_in_progress" };
    }

    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }

    tx.appendOutboxEvent(
      saleCancelledEvent(ids.next(), {
        sale,
        payments: tx.salePayments(sale.id),
        refunds: [],
        movements: tx.saleCashMovements(sale.id),
        actorId,
        authorizedBy: undefined,
        occurredAt: now,
      }),
    );
    if (pendingMercadoPagoPayments.length > 0) {
      tx.recordCancelledSale(sale.id, now, undefined);
    } else {
      tx.discardOpenSale(sale.id);
    }
    return { kind: "cancelled" };
  });
}
