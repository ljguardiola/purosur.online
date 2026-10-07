import { type ChargeRefusal, chargeRefusal } from "../../fiscal/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleTotal } from "../model/sale-line.js";
import { saleBalance } from "../model/sale-balance.js";
import type { SaleLedgerTransaction, SellingSession } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export type SaleRefusal =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "empty_sale" }
  | { kind: "zero_total" }
  | ChargeRefusal;

export interface ChargeableSale {
  session: SellingSession;
  sale: SaleWithLines;
  total: number;
  paid: number;
  pending: number;
}

export interface PartiallyPaid {
  kind: "partially_paid";
  saleId: string;
  total: number;
  paid: number;
  pending: number;
}

export function chargeableSale(
  tx: SaleLedgerTransaction,
  actorId: string,
  saleId: string,
  completedAt: Date,
): ChargeableSale | SaleRefusal {
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
  const refusal = chargeRefusal(total, tx.buyerIdentificationThresholds(), completedAt);
  if (refusal) {
    return refusal;
  }
  const { paid, pending } = saleBalance(total, tx.salePayments(sale.id));
  return { session, sale, total, paid, pending };
}

export function isSaleRefusal(result: ChargeableSale | SaleRefusal): result is SaleRefusal {
  return "kind" in result;
}
