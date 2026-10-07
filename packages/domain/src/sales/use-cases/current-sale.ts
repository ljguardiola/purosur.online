import type { ChargeRefusal } from "../../fiscal/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { type SaleBalance, saleBalance } from "../model/sale-balance.js";
import { saleTotal } from "../model/sale-line.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { Clock, SaleLedger } from "./sale-ledger.js";
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
  | {
      kind: "open";
      sale: SaleWithLines;
      chargeRefusal: ChargeRefusal | undefined;
      balance: SaleBalance;
    };

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
      balance: saleBalance(saleTotal(sale.lines), tx.salePayments(sale.id)),
    };
  });
}
