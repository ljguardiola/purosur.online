import type {
  Authorization,
  CashBalance,
  CloseCashSessionOutcome,
  OpenCashSession,
  OpenCashSessionOutcome,
} from "@purosur/contracts";
import { cashBreakdown } from "@purosur/domain";
import {
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
  authorization: Authorization | undefined;
}

export async function closeCashSessionFor(
  { database, gate, signedInPerson, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  { sessionId, countedCash, authorization }: CloseCashSessionRequest,
): Promise<CloseCashSessionOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const open = readOpenSession(database);
  if (open === undefined) {
    return { kind: "no_open_session" };
  }
  const action =
    open.openedBy === signedInPerson.userId()
      ? ({ closesOwnCashSession: true } as const)
      : ({ permission: "close_anothers_register_session", authorization } as const);
  const guarded = await gate.run(action, async (actor) =>
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
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const outcome = guarded.result;
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

export function cashSessionOpener(database: LocalDatabase): string | undefined {
  return readOpenSession(database)?.openedBy;
}

export function currentCashSession(
  database: LocalDatabase,
  signedInPerson: Pick<SignedInPerson, "set">,
): OpenCashSession | null {
  const session = readOpenSession(database);
  if (session === undefined) {
    return null;
  }
  const opener = new SqliteSignInStore(database).anyPerson(session.openedBy) ?? {
    firstName: "",
    access: { isAdministrator: false, permissionKeys: [] },
  };
  const answer = {
    id: session.id,
    opened_at: session.openedAt.toISOString(),
    opened_by: {
      user_id: session.openedBy,
      first_name: opener.firstName,
      permission_keys: heldPermissionKeys(opener.access),
    },
  };
  signedInPerson.set(session.openedBy);
  return answer;
}

export interface ResumeSignedInPersonDeps {
  database: LocalDatabase;
  signedInPerson: Pick<SignedInPerson, "set" | "clear">;
  reportFailure: (context: string, error: unknown) => void;
}

export function resumeSignedInPerson({
  database,
  signedInPerson,
  reportFailure,
}: ResumeSignedInPersonDeps): void {
  signedInPerson.clear();
  try {
    const session = readOpenSession(database);
    if (session !== undefined) {
      signedInPerson.set(session.openedBy);
    }
  } catch (error) {
    reportFailure("reading who opened the open cash session", error);
  }
}
