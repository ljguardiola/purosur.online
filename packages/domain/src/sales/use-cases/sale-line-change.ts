import type { ChargeRefusal } from "../../fiscal/index.js";
import type { Clock } from "../../shared/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import { saleTotal } from "../model/sale-line.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";
import { saleLinesLocked } from "./sale-lines-locked.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export type SaleLineChangeRefusal =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "sale_has_payments" };

export type ChangedLineOutcome = {
  kind: "changed";
  sale: SaleWithLines;
  chargeRefusal: ChargeRefusal | undefined;
} & OpenSaleStanding;

export function saleToChange(
  tx: SaleLedgerTransaction,
  actorId: string,
  clock: Clock,
): SaleWithLines | SaleLineChangeRefusal {
  const session = sellingSession(tx, actorId);
  if (isRefusal(session)) {
    return session;
  }
  const sale = tx.openSale(session.id);
  if (!sale) {
    return { kind: "no_open_sale" };
  }
  if (saleLinesLocked(tx, sale.id, clock.now())) {
    return { kind: "sale_has_payments" };
  }
  return sale;
}

export function isSaleLineChangeRefusal(
  result: SaleWithLines | SaleLineChangeRefusal,
): result is SaleLineChangeRefusal {
  return !("lines" in result);
}

export function changedLine(
  tx: SaleLedgerTransaction,
  sale: SaleWithLines,
  line: SaleLine,
  updated: SaleLine,
  moment: Date,
): ChangedLineOutcome {
  const changed = { ...sale, lines: sale.lines.map((each) => (each === line ? updated : each)) };
  return {
    kind: "changed",
    sale: changed,
    chargeRefusal: saleChargeRefusal(tx, changed, moment),
    ...openSaleStanding(
      saleTotal(changed.lines),
      tx.salePayments(changed.id),
      tx.pendingQrPaymentsOf(changed.id),
      moment,
    ),
  };
}
