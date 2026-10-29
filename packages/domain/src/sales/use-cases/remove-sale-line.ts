import type { ChargeRefusal } from "../../fiscal/index.js";
import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import type { SaleWithLines } from "../model/sale.js";
import { amountToCharge } from "../model/sale-discount.js";
import type { RegisterRestoration } from "./register-restoration.js";
import { withoutSaleDiscount } from "./remove-sale-discount.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import { saleLineRecord } from "./sale-event-records.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import { saleLinesLocked } from "./sale-lines-locked.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface RemoveSaleLineInput {
  actorId: string;
  lineId: string;
}

export interface RemoveSaleLinePorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  ids: IdGenerator;
  zoneRules: ZoneRulesSource;
}

export type RemoveSaleLineOutcome =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "sale_has_payments" }
  | { kind: "unknown_line" }
  | { kind: "unavailable" }
  | ({
      kind: "removed";
      removedSaleDiscount: boolean;
      sale: SaleWithLines;
      chargeRefusal: ChargeRefusal | undefined;
    } & OpenSaleStanding);

export function removeSaleLine(
  { ledger, restoration, clock, ids, zoneRules }: RemoveSaleLinePorts,
  { actorId, lineId }: RemoveSaleLineInput,
): RemoveSaleLineOutcome {
  return ledger.transaction<RemoveSaleLineOutcome>((tx) => {
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
    const line = sale.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      return { kind: "unknown_line" };
    }

    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }

    tx.deleteSaleLine(line.id);
    const occurredAt = clock.now().toISOString();
    tx.appendOutboxEvent({
      event_id: ids.next(),
      aggregate_type: "Sale",
      aggregate_id: sale.id,
      event_type: "sale_line_removed",
      schema_version: 1,
      payload: {
        sale_id: sale.id,
        register_id: sale.registerId,
        device_id: sale.deviceId,
        session_id: sale.sessionId,
        actor_id: actorId,
        occurred_at: occurredAt,
        line: saleLineRecord({ ...line, saleDiscountShare: 0 }),
      },
      occurred_at: occurredAt,
      actor_id: actorId,
    });
    const { sale: undiscounted, removedSaleDiscount } = withoutSaleDiscount(tx, sale);
    const remaining = { ...undiscounted, lines: sale.lines.filter((each) => each !== line) };
    return {
      kind: "removed",
      removedSaleDiscount,
      sale: remaining,
      chargeRefusal: saleChargeRefusal(tx, remaining, clock.now(), zoneRules.zoneRules()),
      ...openSaleStanding(
        amountToCharge(remaining),
        tx.salePayments(remaining.id),
        tx.pendingMercadoPagoPaymentsOf(remaining.id),
        clock.now(),
      ),
    };
  });
}
