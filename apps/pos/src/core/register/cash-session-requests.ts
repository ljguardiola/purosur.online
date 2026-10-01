import type {
  Authorization,
  CashBalance,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  IdentifyLockedCloserOutcome,
  OpenCashSession,
  OpenCashSessionOutcome,
  SessionOpenSale,
  SignInUser,
} from "@purosur/contracts";
import {
  cancellableWithoutAuthorization,
  cashBreakdown,
  isLockedToAnother,
  mayAuthorize,
  type OpenedCashSession,
  registerAbilities,
} from "@purosur/domain";
import {
  type CloseCashSessionOutcome as CashSessionClosing,
  type Clock,
  closeCashSession,
  type IdGenerator,
  openCashSession,
} from "@purosur/domain/register/use-cases";
import type { ActionGate } from "../access/action-gate";
import { type ActivePerson, SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import {
  readOpenSale,
  readOpenSession,
  readSessionMovements,
  SqliteCashLedger,
} from "./sqlite-cash-ledger";

export interface CashSessionRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
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
  const guarded = await gate.run(
    { kind: "open_cash_session" },
    async ({ signedInUserId }): Promise<OpenCashSessionOutcome> => {
      const people = new SqliteSignInStore(database);
      const opener = people.anyPerson(signedInUserId);
      const outcome = openCashSession(
        {
          ledger: new SqliteCashLedger(database, people, outboxChainKey),
          clock: { now },
          ids,
        },
        { openerId: signedInUserId, openingFloat },
      );
      return outcome.kind === "opened"
        ? {
            kind: "opened",
            cash_session: cashSessionAnswer(outcome.session, opener, signedInUserId),
          }
        : { kind: outcome.kind };
    },
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  return guarded.result;
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
  const guarded = await gate.run({ kind: "close_cash_session", session: open }, async (actor) =>
    closeCashSession(
      {
        ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
        clock: { now },
        ids,
      },
      {
        sessionId,
        closerId: actor.signedInUserId,
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
    { kind: "close_locked_register", session: open },
    closer,
    async (person) =>
      closeCashSession(
        {
          ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
          clock: { now },
          ids,
        },
        { sessionId, closerId: person.user_id, countedCash },
      ),
  );
  return guarded.kind === "performed" ? closingAnswer(guarded.result) : guarded;
}

export async function identifyLockedCloserFor(
  { database, gate }: Pick<CashSessionRequestDeps, "database" | "gate">,
  closer: Authorization,
): Promise<IdentifyLockedCloserOutcome> {
  const open = readOpenSession(database);
  const guarded = await gate.runWhileLocked(
    { kind: "close_locked_register", session: open },
    closer,
    async (person) => person,
  );
  return guarded.kind === "performed" ? { kind: "identified", person: guarded.result } : guarded;
}

export function lockedClosersFor(database: LocalDatabase): SignInUser[] {
  const open = readOpenSession(database);
  return new SqliteSignInStore(database).authorizersWhere((person) =>
    mayAuthorize({ kind: "close_locked_register", session: open }, person),
  );
}

function closingAnswer(
  outcome: CashSessionClosing,
): Extract<CloseCashSessionOutcome, { kind: CashSessionClosing["kind"] }> {
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

export function sessionOpenSaleFor(database: LocalDatabase): SessionOpenSale | null {
  const sale = readOpenSale(database);
  return sale === undefined
    ? null
    : { total: sale.total, cancellable: cancellableWithoutAuthorization(sale.payments) };
}

export function currentCashSession(
  database: LocalDatabase,
  signedInPersonId: string | undefined,
): OpenCashSession | null {
  const session = readOpenSession(database);
  if (session === undefined) {
    return null;
  }
  return cashSessionAnswer(
    session,
    new SqliteSignInStore(database).anyPerson(session.openedBy),
    signedInPersonId,
  );
}

function cashSessionAnswer(
  session: Pick<OpenedCashSession, "id" | "openedAt" | "openedBy">,
  openerRecord: ActivePerson | undefined,
  signedInPersonId: string | undefined,
): OpenCashSession {
  const opener = openerRecord ?? {
    firstName: "",
    access: { isAdministrator: false, permissionKeys: [] },
  };
  return {
    id: session.id,
    opened_at: session.openedAt.toISOString(),
    opened_by: {
      user_id: session.openedBy,
      first_name: opener.firstName,
      abilities: registerAbilities(opener.access),
    },
    locked: isLockedToAnother(session, signedInPersonId),
  };
}
