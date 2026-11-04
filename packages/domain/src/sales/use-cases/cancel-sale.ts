import {
  aMercadoPagoChargeInProgress,
  cancellableWithoutAuthorization,
} from "../../payments/index.js";
import type { Clock } from "../../shared/index.js";
import { endUnpaidSale } from "./end-unpaid-sale.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface CancelSaleInput {
  actorId: string;
}

export interface CancelSalePorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
}

export type CancelSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "has_approved_payment" }
  | { kind: "mercado_pago_charge_in_progress" }
  | { kind: "cancelled" };

export function cancelSale(
  { ledger, restoration, clock }: CancelSalePorts,
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

    endUnpaidSale(tx, sale.id, now);
    return { kind: "cancelled" };
  });
}
