import type {
  ListedCashMovement,
  RecordCashMovementOutcome,
  RecordCashMovementRequest,
} from "@purosur/contracts";
import { cashMovementPermission } from "@purosur/domain";
import { recordCashMovement } from "@purosur/domain/register/use-cases";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import type { CashSessionRequestDeps } from "./cash-session-requests";
import { readOpenSessionMovements, SqliteCashLedger } from "./sqlite-cash-ledger";

export type CashMovementRequest = RecordCashMovementRequest;

export async function recordCashMovementFor(
  { database, gate, readOutboxChainKey, now, ids }: Omit<CashSessionRequestDeps, "signedInPerson">,
  { kind, amount, reason, authorization }: CashMovementRequest,
): Promise<RecordCashMovementOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const guarded = await gate.run(
    { permission: cashMovementPermission(kind), authorization },
    async ({ signedInUserId, authorizedBy }) =>
      recordCashMovement(
        {
          ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
          clock: { now },
          ids,
        },
        { kind, amount, reason, actorId: signedInUserId, authorizedBy: authorizedBy?.user_id },
      ),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const outcome = guarded.result;
  switch (outcome.kind) {
    case "recorded":
      return { kind: "recorded", authorized_by: guarded.authorized_by };
    case "exceeds_expected_cash":
      return outcome;
    default:
      return { kind: outcome.kind };
  }
}

export function currentCashMovements(database: LocalDatabase): ListedCashMovement[] | null {
  return readOpenSessionMovements(database) ?? null;
}
