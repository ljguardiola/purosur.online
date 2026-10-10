import { aQrChargeInItsWait, cancellableWithoutAuthorization } from "../../payments/index.js";
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
  | { kind: "qr_charge_in_progress" }
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

    const pendingQrPayments = tx.pendingQrPaymentsOf(sale.id);
    const now = clock.now();
    if (aQrChargeInItsWait(pendingQrPayments, now)) {
      return { kind: "qr_charge_in_progress" };
    }

    if (pendingQrPayments.length > 0) {
      tx.recordCancelledSale(sale.id, now, undefined);
    } else {
      tx.discardOpenSale(sale.id);
    }
    return { kind: "cancelled" };
  });
}
