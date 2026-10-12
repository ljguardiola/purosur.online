import type { ChargeRefusal } from "../../fiscal/index.js";
import type { Clock } from "../../shared/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import type { SaleWithLines } from "../model/sale.js";
import { amountToCharge } from "../model/sale-discount.js";
import { withoutSaleDiscount } from "./remove-sale-discount.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { SaleLedger } from "./sale-ledger.js";
import { saleLinesLocked } from "./sale-lines-locked.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface RemoveSaleLineInput {
  actorId: string;
  lineId: string;
}

export interface RemoveSaleLinePorts {
  ledger: SaleLedger;
  clock: Clock;
}

export type RemoveSaleLineOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "sale_has_payments" }
  | { kind: "unknown_line" }
  | ({
      kind: "removed";
      removedSaleDiscount: boolean;
      sale: SaleWithLines;
      chargeRefusal: ChargeRefusal | undefined;
    } & OpenSaleStanding);

export function removeSaleLine(
  { ledger, clock }: RemoveSaleLinePorts,
  { actorId, lineId }: RemoveSaleLineInput,
): RemoveSaleLineOutcome {
  return ledger.transaction<RemoveSaleLineOutcome>((tx) => {
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
    const line = sale.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      return { kind: "unknown_line" };
    }

    tx.deleteSaleLine(line.id);
    const { sale: undiscounted, removedSaleDiscount } = withoutSaleDiscount(tx, sale);
    const remaining = { ...undiscounted, lines: sale.lines.filter((each) => each !== line) };
    return {
      kind: "removed",
      removedSaleDiscount,
      sale: remaining,
      chargeRefusal: saleChargeRefusal(tx, remaining, clock.now()),
      ...openSaleStanding(
        amountToCharge(remaining),
        tx.salePayments(remaining.id),
        tx.pendingMercadoPagoPaymentsOf(remaining.id),
        clock.now(),
      ),
    };
  });
}
