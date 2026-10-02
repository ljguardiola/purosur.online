import type {
  AuthorizationRefusal,
  AuthorizedBy,
  ListedCashMovement,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  RecordCashMovementRequest,
} from "@purosur/contracts";
import {
  type CashMovementKind,
  cashMovementPermission,
  type RegisterActor,
  registerOperationAccess,
} from "@purosur/domain";
import {
  type OperationAuthorization,
  type RecordCashMovementGrant,
  recordCashMovement,
} from "@purosur/domain/register/use-cases";
import type { SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { inArgentinaTime } from "../platform/argentina-time";
import type { LocalDatabase } from "../platform/local-database";
import type { CashSessionRequestDeps } from "./cash-session-requests";
import { readOpenSessionMovements, SqliteCashLedger } from "./sqlite-cash-ledger";

export type CashMovementRequest = RecordCashMovementRequest;

interface CashMovementGrant extends RecordCashMovementGrant {
  authorizer: AuthorizedBy | null;
}

type CashMovementRefusal = Extract<
  RecordCashMovementOutcome,
  { kind: "unavailable" | "not_signed_in" | "lacks_permission" | AuthorizationRefusal["kind"] }
>;

export async function recordCashMovementFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  { kind, amount, reason, authorization }: CashMovementRequest,
): Promise<RecordCashMovementOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const outcome = await recordCashMovement<CashMovementGrant, CashMovementRefusal>(
    {
      ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
      clock: { now },
      ids,
      authority: {
        async authorize(): Promise<OperationAuthorization<CashMovementGrant, CashMovementRefusal>> {
          if (outboxChainKey === undefined) {
            return { kind: "refused", refusal: { kind: "unavailable" } };
          }
          const guarded = await gate.runAuthorized(
            { kind: "record_cash_movement", movement: kind },
            authorization,
            async (actor) => actor,
          );
          return guarded.kind === "performed"
            ? {
                kind: "granted",
                grant: {
                  actorId: guarded.result.signedInUserId,
                  authorizedBy: guarded.authorized_by?.user_id,
                  authorizer: guarded.authorized_by,
                },
              }
            : { kind: "refused", refusal: guarded };
        },
      },
    },
    { kind, amount, reason },
  );
  switch (outcome.kind) {
    case "recorded":
      return { kind: "recorded", authorized_by: outcome.grant.authorizer };
    case "invalid_reason":
      return { kind: "invalid_reason", max_length: outcome.maxLength };
    default:
      return outcome;
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
