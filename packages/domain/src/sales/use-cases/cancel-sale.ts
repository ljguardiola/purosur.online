import { cancellableWithoutAuthorization } from "../model/payment.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface CancelSaleInput {
  actorId: string;
  from: "sale" | "locked_register";
}

interface CancelSaleFromLockedRegisterInput extends CancelSaleInput {
  from: "locked_register";
}

export interface CancelSalePorts {
  ledger: SaleLedger;
}

export type CancelSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "has_approved_payment" }
  | { kind: "cancelled" };

export type CancelLockedSaleOutcome = Exclude<CancelSaleOutcome, { kind: "not_permitted" }>;

export function cancelSale(
  ports: CancelSalePorts,
  input: CancelSaleFromLockedRegisterInput,
): CancelLockedSaleOutcome;
export function cancelSale(ports: CancelSalePorts, input: CancelSaleInput): CancelSaleOutcome;
export function cancelSale(
  { ledger }: CancelSalePorts,
  { actorId, from }: CancelSaleInput,
): CancelSaleOutcome {
  return ledger.transaction<CancelSaleOutcome>((tx) => {
    const session = from === "sale" ? sellingSession(tx, actorId) : tx.openSession();
    if (!session) {
      return { kind: "no_open_session" };
    }
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

    tx.discardOpenSale(sale.id);
    return { kind: "cancelled" };
  });
}
