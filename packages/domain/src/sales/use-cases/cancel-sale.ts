import {
  aMercadoPagoChargeInProgress,
  cancellableWithoutAuthorization,
} from "../../payments/index.js";
import type { Clock } from "../../shared/index.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface CancelSaleInput {
  actorId: string;
}

export interface CancelSalePorts {
  ledger: SaleLedger;
  clock: Clock;
}

export type CancelSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "has_approved_payment" }
  | { kind: "mercado_pago_charge_in_progress" }
  | { kind: "cancelled" };

export function cancelSale(
  { ledger, clock }: CancelSalePorts,
  { actorId }: CancelSaleInput,
): CancelSaleOutcome {
  return ledger.transaction<CancelSaleOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
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

    if (pendingMercadoPagoPayments.length > 0) {
      tx.recordCancelledSale(sale.id, now, undefined);
    } else {
      tx.discardOpenSale(sale.id);
    }
    return { kind: "cancelled" };
  });
}
