import type {
  ListedCashMovement,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  RecordCashMovementRequest,
} from "@purosur/contracts";
import {
  type CashMovementKind,
  cashMovementPermission,
  holdsPermission,
  type RoleAccess,
} from "@purosur/domain";
import { recordCashMovement } from "@purosur/domain/register/use-cases";
import type { SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import type { CashSessionRequestDeps } from "./cash-session-requests";
import { readOpenSessionMovements, SqliteCashLedger } from "./sqlite-cash-ledger";

export type CashMovementRequest = RecordCashMovementRequest;

export async function recordCashMovementFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
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
  if (access === undefined) {
    return null;
  }
  return {
    CASH_IN: authorizationNeeded(access, "CASH_IN"),
    CASH_OUT: authorizationNeeded(access, "CASH_OUT"),
    WITHDRAWAL: authorizationNeeded(access, "WITHDRAWAL"),
  };
}

function authorizationNeeded(
  access: RoleAccess,
  kind: CashMovementKind,
): RecordableCashMovementKinds[CashMovementKind] {
  const permission = cashMovementPermission(kind);
  return { permission, authorization_required: !holdsPermission(access, permission) };
}

export function currentCashMovements(database: LocalDatabase): ListedCashMovement[] | null {
  return readOpenSessionMovements(database) ?? null;
}
