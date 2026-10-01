import type {
  Authorization,
  CashBalance,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  GuardedActionRefusal,
  IdentifyLockedCloserOutcome,
  OpenCashSession,
  OpenCashSessionOutcome,
  SignInUser,
} from "@purosur/contracts";
import { cashBreakdown, isLockedToAnother } from "@purosur/domain";
import {
  type CloseCashSessionOutcome as CashSessionClosing,
  type Clock,
  closeCashSession,
  type IdGenerator,
  openCashSession,
} from "@purosur/domain/register/use-cases";
import type { ActionGate } from "../access/action-gate";
import { heldPermissionKeys } from "../access/held-permission-keys";
import type { SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSession, readSessionMovements, SqliteCashLedger } from "./sqlite-cash-ledger";

export interface CashSessionRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  signedInPerson: Pick<SignedInPerson, "userId">;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: Clock["now"];
  ids: IdGenerator;
}

export async function openCashSessionFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  openingFloat: number,
): Promise<OpenCashSessionOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const guarded = await gate.run({ permission: "sell_and_charge" }, async ({ signedInUserId }) =>
    openCashSession(
      {
        ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
        clock: { now },
        ids,
      },
      { openerId: signedInUserId, openingFloat },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  return outcome.kind === "opened"
    ? {
        kind: "opened",
        session: {
          id: outcome.session.id,
          opened_at: outcome.session.openedAt.toISOString(),
          opening_float: outcome.session.openingFloat,
        },
      }
    : { kind: outcome.kind };
}

export interface CloseCashSessionRequest {
  sessionId: string;
  countedCash: number;
}

export async function closeCashSessionFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  { sessionId, countedCash }: CloseCashSessionRequest,
): Promise<CloseCashSessionOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const open = readOpenSession(database);
  if (open === undefined) {
    return { kind: "no_open_session" };
  }
  const guarded = await gate.run({ closesCashSession: open }, async (actor) =>
    closeCashSession(
      {
        ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
        clock: { now },
        ids,
      },
      {
        sessionId,
        closerId: actor.signedInUserId,
        authorizedBy: actor.authorizedBy?.user_id ?? null,
        countedCash,
      },
    ),
  );
  return guarded.kind === "performed" ? closingAnswer(guarded.result) : guarded;
}

export interface CloseLockedCashSessionRequest {
  sessionId: string;
  countedCash: number;
  closer: Authorization;
}

export async function closeLockedCashSessionFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  { sessionId, countedCash, closer }: CloseLockedCashSessionRequest,
): Promise<CloseLockedCashSessionOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const open = readOpenSession(database);
  if (open === undefined) {
    return { kind: "no_open_session" };
  }
  const guarded = await gate.runWhileLocked(
    "close_anothers_register_session",
    closer,
    async (person) =>
      isLockedToAnother(open, person.user_id)
        ? closeCashSession(
            {
              ledger: new SqliteCashLedger(
                database,
                new SqliteSignInStore(database),
                outboxChainKey,
              ),
              clock: { now },
              ids,
            },
            { sessionId, closerId: person.user_id, authorizedBy: null, countedCash },
          )
        : undefined,
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  return guarded.result === undefined
    ? { kind: "lacks_permission" }
    : closingAnswer(guarded.result);
}

export async function identifyLockedCloserFor(
  { database, gate }: Pick<CashSessionRequestDeps, "database" | "gate">,
  closer: Authorization,
): Promise<IdentifyLockedCloserOutcome> {
  const open = readOpenSession(database);
  const guarded = await gate.runWhileLocked(
    "close_anothers_register_session",
    closer,
    async (person) => (isLockedToAnother(open, person.user_id) ? person : undefined),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  return guarded.result === undefined
    ? { kind: "lacks_permission" }
    : { kind: "identified", person: guarded.result };
}

export function lockedClosersFor(database: LocalDatabase): SignInUser[] {
  const open = readOpenSession(database);
  return new SqliteSignInStore(database)
    .authorizers("close_anothers_register_session")
    .filter((user) => isLockedToAnother(open, user.id));
}

function closingAnswer(
  outcome: CashSessionClosing,
): Exclude<CloseCashSessionOutcome, { kind: GuardedActionRefusal["kind"] }> {
  return outcome.kind === "closed"
    ? {
        kind: "closed",
        session: {
          id: outcome.session.id,
          expected_cash: outcome.session.expectedCash,
          counted_cash: outcome.session.countedCash,
          difference: outcome.session.difference,
        },
      }
    : outcome;
}

export function cashBalanceFor(database: LocalDatabase): CashBalance | null {
  const session = readOpenSession(database);
  if (session === undefined) {
    return null;
  }
  const balance = cashBreakdown(readSessionMovements(database, session.id));
  return {
    opening_float: balance.openingFloat,
    cash_sales: balance.cashSales,
    change_given: balance.changeGiven,
    refunds: balance.refunds,
    cash_in: balance.cashIn,
    expenses: balance.expenses,
    withdrawals: balance.withdrawals,
    expected: balance.expected,
  };
}

export function currentCashSession(
  database: LocalDatabase,
  signedInPersonId: string | undefined,
): OpenCashSession | null {
  const session = readOpenSession(database);
  if (session === undefined) {
    return null;
  }
  const opener = new SqliteSignInStore(database).anyPerson(session.openedBy) ?? {
    firstName: "",
    access: { isAdministrator: false, permissionKeys: [] },
  };
  return {
    id: session.id,
    opened_at: session.openedAt.toISOString(),
    opened_by: {
      user_id: session.openedBy,
      first_name: opener.firstName,
      permission_keys: heldPermissionKeys(opener.access),
    },
    locked: isLockedToAnother(session, signedInPersonId),
  };
}
