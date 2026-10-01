import type { JsonValue } from "../../sync/index.js";
import { cancellableWithoutAuthorization } from "../model/payment.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import type { SaleLineRemoval } from "../model/sale-line-removal.js";
import { removalRecord } from "./removal-record.js";
import type { Clock, IdGenerator, SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface CancelSaleInput {
  actorId: string;
  from: "sale" | "locked_register";
}

interface CancelSaleFromLockedRegisterInput extends CancelSaleInput {
  from: "locked_register";
}

export interface CancelSalePorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type CancelSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "has_approved_payment" }
  | { kind: "cancelled"; sale: SaleWithLines };

export type CancelLockedSaleOutcome = Exclude<CancelSaleOutcome, { kind: "not_permitted" }>;

export function cancelSale(
  ports: CancelSalePorts,
  input: CancelSaleFromLockedRegisterInput,
): CancelLockedSaleOutcome;
export function cancelSale(ports: CancelSalePorts, input: CancelSaleInput): CancelSaleOutcome;
export function cancelSale(
  { ledger, clock, ids }: CancelSalePorts,
  { actorId, from }: CancelSaleInput,
): CancelSaleOutcome {
  return ledger.transaction<CancelSaleOutcome>((tx) => {
    const session = from === "sale" ? sellingSession(tx, actorId) : tx.openSession();
    if (!session) {
      return { kind: "no_open_session" };
    }
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    if (!sale) {
      return { kind: "no_open_sale" };
    }
    if (!cancellableWithoutAuthorization(tx.salePayments(sale.id))) {
      return { kind: "has_approved_payment" };
    }

    const cancelled: SaleWithLines = { ...sale, state: "CANCELLED" };
    tx.markSaleCancelled(sale.id);
    const occurredAt = clock.now().toISOString();
    tx.appendOutboxEvent({
      event_id: ids.next(),
      aggregate_type: "Sale",
      aggregate_id: sale.id,
      event_type: "sale_cancelled",
      schema_version: 1,
      payload: cancellationPayload(cancelled, tx.saleLineRemovals(sale.id)),
      occurred_at: occurredAt,
      actor_id: actorId,
    });
    return { kind: "cancelled", sale: cancelled };
  });
}

function cancellationPayload(
  sale: SaleWithLines,
  removals: readonly SaleLineRemoval[],
): { [member: string]: JsonValue } {
  return {
    id: sale.id,
    register_id: sale.registerId,
    device_id: sale.deviceId,
    session_id: sale.sessionId,
    actor_id: sale.actorId,
    state: sale.state,
    occurred_at: sale.occurredAt.toISOString(),
    lines: sale.lines.map(heldLine),
    removals: removals.map(removalRecord),
  };
}

function heldLine(line: SaleLine): JsonValue {
  return {
    id: line.id,
    product_id: line.productId,
    product_name: line.productName,
    quantity: line.quantity,
    list_unit_price: line.listUnitPrice,
    price_list_id: line.priceListId,
    promotion_id: line.promotionId,
    discount_amount: line.discountAmount,
    line_total: line.lineTotal,
  };
}
