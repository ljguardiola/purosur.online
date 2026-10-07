import type { ChargeRefusal } from "../../fiscal/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import { hasApprovedPayment } from "../model/payment.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleTotal, withQuantity } from "../model/sale-line.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { Clock, SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface ChangeLineQuantityInput {
  actorId: string;
  lineId: string;
  quantity: number;
  expectedQuantity: number;
}

export interface ChangeLineQuantityPorts {
  ledger: SaleLedger;
  clock: Clock;
}

export type ChangeLineQuantityOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "sale_has_payments" }
  | { kind: "invalid_quantity" }
  | { kind: "unknown_line" }
  | { kind: "stale_quantity" }
  | ({
      kind: "changed";
      sale: SaleWithLines;
      chargeRefusal: ChargeRefusal | undefined;
    } & OpenSaleStanding);

export function changeLineQuantity(
  { ledger, clock }: ChangeLineQuantityPorts,
  { actorId, lineId, quantity, expectedQuantity }: ChangeLineQuantityInput,
): ChangeLineQuantityOutcome {
  return ledger.transaction<ChangeLineQuantityOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    if (!sale) {
      return { kind: "no_open_sale" };
    }
    if (hasApprovedPayment(tx.salePayments(sale.id))) {
      return { kind: "sale_has_payments" };
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return { kind: "invalid_quantity" };
    }
    const line = sale.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      return { kind: "unknown_line" };
    }
    if (line.quantity !== expectedQuantity) {
      return { kind: "stale_quantity" };
    }

    const updated = withQuantity(line, quantity);
    if (quantity !== line.quantity) {
      tx.recordLineQuantity(updated);
    }
    const changed = { ...sale, lines: sale.lines.map((each) => (each === line ? updated : each)) };
    return {
      kind: "changed",
      sale: changed,
      chargeRefusal: saleChargeRefusal(tx, changed, clock.now()),
      ...openSaleStanding(saleTotal(changed.lines), tx.salePayments(changed.id)),
    };
  });
}
