import type {
  ListedCashMovement,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  RecordCashMovementRequest,
} from "@purosur/contracts";
import {
  type CashMovementKind,
  cashMovementPermission,
  isValidCashMovementAmount,
  type RegisterActor,
  registerOperationAccess,
} from "@purosur/domain";
import { recordCashMovement } from "@purosur/domain/register/use-cases";
import type { SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { inArgentinaTime } from "../platform/argentina-time";
import type { LocalDatabase } from "../platform/local-database";
import type { CashSessionRequestDeps } from "./cash-session-requests";
import { readOpenSessionMovements, SqliteCashLedger } from "./sqlite-cash-ledger";

export type CashMovementRequest = RecordCashMovementRequest;

export async function recordCashMovementFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  { kind, amount, reason, authorization }: CashMovementRequest,
): Promise<RecordCashMovementOutcome> {
  if (!isValidCashMovementAmount(amount)) {
    return { kind: "invalid_amount" };
  }
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const guarded = await gate.runAuthorized(
    { kind: "record_cash_movement", movement: kind },
    authorization,
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
    case "invalid_reason":
      return { kind: "invalid_reason", max_length: outcome.maxLength };
    default:
      return { kind: outcome.kind };
  }
}

export function cashMovementKindsFor({
  database,
  signedInPerson,
}: {
  database: LocalDatabase;
  signedInPerson: Pick<SignedInPerson, "userId">;
}): RecordableCashMovementKinds | null {
  const signedInUserId = signedInPerson.userId();
  const access =
    signedInUserId === undefined
      ? undefined
      : new SqliteSignInStore(database).activePerson(signedInUserId)?.access;
  if (signedInUserId === undefined || access === undefined) {
    return null;
  }
  const actor = { id: signedInUserId, access };
  return {
    CASH_IN: authorizationNeeded(actor, "CASH_IN"),
    CASH_OUT: authorizationNeeded(actor, "CASH_OUT"),
    WITHDRAWAL: authorizationNeeded(actor, "WITHDRAWAL"),
  };
}

function authorizationNeeded(
  actor: RegisterActor,
  movement: CashMovementKind,
): RecordableCashMovementKinds[CashMovementKind] {
  const answer = registerOperationAccess({ kind: "record_cash_movement", movement }, actor);
  return {
    permission: cashMovementPermission(movement),
    authorization_required: answer.kind === "needs_authorization",
  };
}

export function currentCashMovements(database: LocalDatabase): ListedCashMovement[] | null {
  return (
    readOpenSessionMovements(database)?.map((movement) => ({
      ...movement,
      occurred_at: inArgentinaTime(new Date(movement.occurred_at)),
    })) ?? null
  );
}
