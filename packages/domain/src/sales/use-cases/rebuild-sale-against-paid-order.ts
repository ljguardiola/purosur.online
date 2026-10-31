import type { RegisterRestoration } from "./register-restoration.js";
import { type NewSaleRefusal, newSaleRefusal, startSale } from "./sale-addition.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import { isRefusal, type SellingSessionRefusal, sellingSession } from "./selling-session.js";

export interface RebuildSaleAgainstPaidOrderInput {
  actorId: string;
  paymentTransactionId: string;
}

export interface RebuildSaleAgainstPaidOrderPorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  ids: IdGenerator;
}

export type RebuildSaleAgainstPaidOrderOutcome =
  | SellingSessionRefusal
  | NewSaleRefusal
  | { kind: "not_found" }
  | { kind: "already_resolved" }
  | { kind: "already_open"; saleId: string }
  | { kind: "another_sale_open" }
  | { kind: "card_type_unknown" }
  | { kind: "unavailable" }
  | { kind: "rebuilt"; saleId: string };

export function rebuildSaleAgainstPaidOrder(
  { ledger, restoration, ids }: RebuildSaleAgainstPaidOrderPorts,
  { actorId, paymentTransactionId }: RebuildSaleAgainstPaidOrderInput,
): RebuildSaleAgainstPaidOrderOutcome {
  return ledger.transaction<RebuildSaleAgainstPaidOrderOutcome>((tx) => {
    const session = sellingSession(tx, actorId, restoration);
    if (isRefusal(session)) {
      return session;
    }
    const paidOrder = tx.rebuildablePaidOrder(paymentTransactionId);
    if (paidOrder === undefined) {
      return { kind: "not_found" };
    }
    if (paidOrder.resolved) {
      return { kind: "already_resolved" };
    }
    if (paidOrder.cardType === null) {
      return { kind: "card_type_unknown" };
    }
    const open = tx.openSale(session.id);
    if (open) {
      return tx.paidOrderOfSale(open.id)?.paymentTransactionId === paymentTransactionId
        ? { kind: "already_open", saleId: open.id }
        : { kind: "another_sale_open" };
    }
    const refusal = newSaleRefusal(tx);
    if (refusal !== undefined) {
      return refusal;
    }
    const identity = tx.registerIdentity();
    if (!identity) {
      return { kind: "unavailable" };
    }
    const sale = startSale(tx, ids.next(), identity, session.id, actorId);
    tx.recordSaleRebuiltAgainstPaidOrder(sale.id, paymentTransactionId);
    return { kind: "rebuilt", saleId: sale.id };
  });
}
