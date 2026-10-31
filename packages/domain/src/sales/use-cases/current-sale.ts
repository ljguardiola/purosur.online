import type { ChargeRefusal } from "../../fiscal/index.js";
import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { type OpenSaleAnswerStanding, openSaleStandingOf } from "./open-sale-standing-of.js";
import type { RegisterRestoration } from "./register-restoration.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface CurrentSaleInput {
  actorId: string;
}

export interface CurrentSalePorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export type CurrentSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" }
  | { kind: "no_sale" }
  | ({
      kind: "open";
      sale: SaleWithLines;
      chargeRefusal: ChargeRefusal | undefined;
    } & OpenSaleAnswerStanding);

export function currentSale(
  { ledger, restoration, clock, zoneRules }: CurrentSalePorts,
  { actorId }: CurrentSaleInput,
): CurrentSaleOutcome {
  return ledger.transaction<CurrentSaleOutcome>((tx) => {
    const session = sellingSession(tx, actorId, restoration);
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
      chargeRefusal: saleChargeRefusal(tx, sale, clock.now(), zoneRules.zoneRules()),
      ...openSaleStandingOf(tx, sale, clock.now()),
    };
  });
}
