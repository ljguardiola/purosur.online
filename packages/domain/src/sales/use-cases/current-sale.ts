import type { ChargeRefusal } from "../../fiscal/index.js";
import type { Clock } from "../../shared/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleTotal } from "../model/sale-line.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface CurrentSaleInput {
  actorId: string;
}

export interface CurrentSalePorts {
  ledger: SaleLedger;
  clock: Clock;
}

export type CurrentSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_sale" }
  | ({
      kind: "open";
      sale: SaleWithLines;
      chargeRefusal: ChargeRefusal | undefined;
    } & OpenSaleStanding);

export function currentSale(
  { ledger, clock }: CurrentSalePorts,
  { actorId }: CurrentSaleInput,
): CurrentSaleOutcome {
  return ledger.transaction<CurrentSaleOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    if (!sale) {
      return { kind: "no_sale" };
    }
    return {
      kind: "open",
      sale,
      chargeRefusal: saleChargeRefusal(tx, sale, clock.now()),
      ...openSaleStanding(saleTotal(sale.lines), tx.salePayments(sale.id)),
    };
  });
}
