import type { ChargeRefusal } from "../../fiscal/index.js";
import type { Clock } from "../../shared/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import { amountToCharge } from "../model/sale-discount.js";
import type { RegisterRestoration } from "./register-restoration.js";
import { withoutSaleDiscount } from "./remove-sale-discount.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";
import { saleLinesLocked } from "./sale-lines-locked.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export type SaleLineChangeRefusal =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "sale_has_payments" };

export type ChangedLineOutcome = {
  kind: "changed";
  removedManualDiscount: boolean;
  removedSaleDiscount: boolean;
  sale: SaleWithLines;
  chargeRefusal: ChargeRefusal | undefined;
} & OpenSaleStanding;

export function saleToChange(
  tx: SaleLedgerTransaction,
  actorId: string,
  clock: Clock,
  restoration: RegisterRestoration,
): SaleWithLines | SaleLineChangeRefusal {
  const session = sellingSession(tx, actorId, restoration);
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
  const changesTotal =
    updated.quantity !== line.quantity || updated.manualAdjustment !== line.manualAdjustment;
  const { sale: kept, removedSaleDiscount } = changesTotal
    ? withoutSaleDiscount(tx, sale)
    : { sale, removedSaleDiscount: false };
  const changed = { ...kept, lines: sale.lines.map((each) => (each === line ? updated : each)) };
  return {
    kind: "changed",
    removedManualDiscount: line.manualAdjustment !== null && updated.manualAdjustment === null,
    removedSaleDiscount,
    sale: changed,
    chargeRefusal: saleChargeRefusal(tx, changed, moment),
    ...openSaleStanding(
      amountToCharge(changed),
      tx.salePayments(changed.id),
      tx.pendingMercadoPagoPaymentsOf(changed.id),
      moment,
    ),
  };
}
