import type { SaleWithLines } from "../model/sale.js";
import { saleTotal } from "../model/sale-line.js";
import type { SaleLedgerTransaction, SellingSession } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export type ChargeRefusal =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "empty_sale" }
  | { kind: "zero_total" };

export interface ChargeableSale {
  session: SellingSession;
  sale: SaleWithLines;
  total: number;
}

export function chargeableSale(
  tx: SaleLedgerTransaction,
  actorId: string,
  saleId: string,
): ChargeableSale | ChargeRefusal {
  const session = sellingSession(tx, actorId);
  if (isRefusal(session)) {
    return session;
  }
  const sale = tx.openSale(session.id);
  if (!sale || sale.id !== saleId) {
    return { kind: "no_open_sale" };
  }
  if (sale.lines.length === 0) {
    return { kind: "empty_sale" };
  }
  const total = saleTotal(sale.lines);
  if (total === 0) {
    return { kind: "zero_total" };
  }
  return { session, sale, total };
}

export function isChargeRefusal(result: ChargeableSale | ChargeRefusal): result is ChargeRefusal {
  return "kind" in result;
}
