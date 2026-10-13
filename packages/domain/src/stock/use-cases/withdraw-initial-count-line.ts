import type { Clock } from "../../shared/index.js";
import { type InitialCountRefusal, initialCountRefusal } from "./initial-count-access.js";
import type { InitialCountIds, InitialCountLedger } from "./initial-count-ledger.js";

export interface WithdrawInitialCountLineInput {
  actorId: string;
  movementId: string;
}

export interface WithdrawInitialCountLinePorts {
  ledger: InitialCountLedger;
  clock: Clock;
  ids: InitialCountIds;
}

export type WithdrawInitialCountLineOutcome =
  | InitialCountRefusal
  | { kind: "unavailable" }
  | { kind: "not_found" }
  | { kind: "already_withdrawn" }
  | { kind: "withdrawn" };

export function withdrawInitialCountLine(
  { ledger, clock, ids }: WithdrawInitialCountLinePorts,
  { actorId, movementId }: WithdrawInitialCountLineInput,
): WithdrawInitialCountLineOutcome {
  return ledger.transaction<WithdrawInitialCountLineOutcome>((tx) => {
    const refusal = initialCountRefusal(tx, actorId);
    if (refusal) {
      return refusal;
    }
    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }
    const line = tx.initialCountLine(movementId);
    if (!line) {
      return { kind: "not_found" };
    }
    if (line.withdrawn) {
      return { kind: "already_withdrawn" };
    }

    const withdrawnAt = clock.now();
    const withdrawalId = ids.next();
    tx.recordInitialCountMovement({
      id: withdrawalId,
      productId: line.productId,
      kind: "opening_count_withdrawal",
      delta: -line.counted,
      occurredAt: withdrawnAt,
      expiresOn: null,
      withdrawsMovementId: movementId,
    });
    tx.addToStockBalance(line.productId, -line.counted);
    tx.appendOutboxEvent({
      event_id: ids.next(),
      aggregate_type: "StockMovement",
      aggregate_id: withdrawalId,
      event_type: "opening_count_withdrawn",
      schema_version: 1,
      payload: { movement_id: withdrawalId, withdrawn_movement_id: movementId },
      occurred_at: withdrawnAt.toISOString(),
      actor_id: actorId,
    });
    return { kind: "withdrawn" };
  });
}
