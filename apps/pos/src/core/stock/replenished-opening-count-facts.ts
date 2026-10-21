import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { insertInitialCountMovement } from "./sqlite-initial-count-ledger";
import { addToStockBalance } from "./sqlite-stock-ledger";

type OpeningCountFact = Extract<
  SyncedFact,
  { kind: "opening_count_recorded" | "opening_count_withdrawn" }
>;

function movementHeld(database: LocalDatabase, movementId: string): boolean {
  return (
    database.prepare("SELECT 1 FROM stock_movements WHERE id = ?").get(movementId) !== undefined
  );
}

function recordCount(
  database: LocalDatabase,
  { count }: Extract<OpeningCountFact, { kind: "opening_count_recorded" }>,
): void {
  if (movementHeld(database, count.movementId)) {
    return;
  }
  insertInitialCountMovement(database, {
    id: count.movementId,
    productId: count.productId,
    kind: "opening_count",
    delta: count.counted,
    occurredAt: count.countedAt,
    expiresOn: count.expiresOn,
    withdrawsMovementId: null,
  });
  addToStockBalance(database, count.productId, count.counted);
}

function withdrawCount(
  database: LocalDatabase,
  { withdrawal }: Extract<OpeningCountFact, { kind: "opening_count_withdrawn" }>,
): void {
  if (movementHeld(database, withdrawal.movementId)) {
    return;
  }
  const counted = database
    .prepare<[string], { product_id: string; delta: number }>(
      "SELECT product_id, delta FROM stock_movements WHERE id = ?",
    )
    .get(withdrawal.withdrawnMovementId);
  if (counted === undefined) {
    throw new Error(`opening count ${withdrawal.withdrawnMovementId} is not held`);
  }
  insertInitialCountMovement(database, {
    id: withdrawal.movementId,
    productId: counted.product_id,
    kind: "opening_count_withdrawal",
    delta: -counted.delta,
    occurredAt: withdrawal.withdrawnAt,
    expiresOn: null,
    withdrawsMovementId: withdrawal.withdrawnMovementId,
  });
  addToStockBalance(database, counted.product_id, -counted.delta);
}

export function applyReplenishedOpeningCountFact(
  database: LocalDatabase,
  fact: OpeningCountFact,
): void {
  if (fact.kind === "opening_count_recorded") {
    recordCount(database, fact);
  } else {
    withdrawCount(database, fact);
  }
}
