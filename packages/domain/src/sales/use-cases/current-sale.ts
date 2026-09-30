import type { SaleWithLines } from "../model/sale.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface CurrentSaleInput {
  actorId: string;
}

export interface CurrentSalePorts {
  ledger: SaleLedger;
}

export type CurrentSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_sale" }
  | { kind: "open"; sale: SaleWithLines };

export function currentSale(
  { ledger }: CurrentSalePorts,
  { actorId }: CurrentSaleInput,
): CurrentSaleOutcome {
  return ledger.transaction<CurrentSaleOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    return sale ? { kind: "open", sale } : { kind: "no_sale" };
  });
}
