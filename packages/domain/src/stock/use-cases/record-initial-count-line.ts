import type { Clock } from "../../shared/index.js";
import { isCalendarDay } from "../../shared/index.js";
import { isMovementQuantity } from "../model/stock-quantity.js";
import { type InitialCountRefusal, initialCountRefusal } from "./initial-count-access.js";
import type {
  InitialCountIds,
  InitialCountLedger,
  InitialCountLine,
} from "./initial-count-ledger.js";

export interface RecordInitialCountLineInput {
  actorId: string;
  productId: string;
  counted: number;
  expiresOn: string | null;
}

export interface RecordInitialCountLinePorts {
  ledger: InitialCountLedger;
  clock: Clock;
  ids: InitialCountIds;
}

export type InitialCountLineView = Omit<InitialCountLine, "confirmedAt" | "withdrawn">;

export type RecordInitialCountLineOutcome =
  | InitialCountRefusal
  | { kind: "unavailable" }
  | { kind: "unknown_product" }
  | { kind: "invalid_quantity" }
  | { kind: "invalid_expiry" }
  | { kind: "recorded"; line: InitialCountLineView };

export function recordInitialCountLine(
  { ledger, clock, ids }: RecordInitialCountLinePorts,
  { actorId, productId, counted, expiresOn }: RecordInitialCountLineInput,
): RecordInitialCountLineOutcome {
  return ledger.transaction<RecordInitialCountLineOutcome>((tx) => {
    const refusal = initialCountRefusal(tx, actorId);
    if (refusal) {
      return refusal;
    }
    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }
    const product = tx.activeProductById(productId);
    if (!product) {
      return { kind: "unknown_product" };
    }
    if (!isMovementQuantity(product.saleUnit, counted)) {
      return { kind: "invalid_quantity" };
    }
    if (expiresOn !== null && !isCalendarDay(expiresOn)) {
      return { kind: "invalid_expiry" };
    }

    const countedAt = clock.now();
    const movementId = ids.next();
    tx.recordInitialCountMovement({
      id: movementId,
      productId,
      kind: "opening_count",
      delta: counted,
      occurredAt: countedAt,
      expiresOn,
      withdrawsMovementId: null,
    });
    tx.addToStockBalance(productId, counted);
    tx.appendOutboxEvent({
      event_id: ids.next(),
      aggregate_type: "StockMovement",
      aggregate_id: movementId,
      event_type: "opening_count_recorded",
      schema_version: 1,
      payload: {
        movement_id: movementId,
        product_id: productId,
        counted,
        expires_on: expiresOn,
      },
      occurred_at: countedAt.toISOString(),
      actor_id: actorId,
    });
    return {
      kind: "recorded",
      line: {
        movementId,
        productId,
        productName: product.name,
        saleUnit: product.saleUnit,
        counted,
        expiresOn,
      },
    };
  });
}
