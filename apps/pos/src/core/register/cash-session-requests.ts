import type {
  Authorization,
  AuthorizationRefusal,
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
  type ClosedCashSession,
  cashBreakdown,
  isLockedToAnother,
  type OpenedCashSession,
  openSaleSummary,
  registerAbilities,
} from "@purosur/domain";
import {
  type Clock,
  type CloseCashSessionGrant,
  closeCashSession,
  type IdGenerator,
  type OpenCashSessionGrant,
  type OperationAuthorization,
  openCashSession,
} from "@purosur/domain/register/use-cases";
import type { ActionGate } from "../access/action-gate";
import { authorizersOf } from "../access/authorizers";
import { type ActivePerson, SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { inArgentinaTime } from "../platform/argentina-time";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSale } from "../sales/sqlite-open-sale";
import { readSalePayments } from "../sales/sqlite-sale-payments";
import { readOpenSession, readSessionMovements, SqliteCashLedger } from "./sqlite-cash-ledger";

export interface CashSessionRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: Clock["now"];
  ids: IdGenerator;
}

interface OpeningGrant extends OpenCashSessionGrant {
  opener: ActivePerson | undefined;
}

type OpeningRefusal = Extract<
  OpenCashSessionOutcome,
  { kind: "unavailable" | "not_signed_in" | "not_permitted" }
>;

export async function openCashSessionFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  openingFloat: number,
): Promise<OpenCashSessionOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const people = new SqliteSignInStore(database);
  const outcome = await openCashSession<OpeningGrant, OpeningRefusal>(
    {
      ledger: new SqliteCashLedger(database, people, outboxChainKey),
      clock: { now },
      ids,
      authority: {
        async authorize(): Promise<OperationAuthorization<OpeningGrant, OpeningRefusal>> {
          if (outboxChainKey === undefined) {
            return { kind: "refused", refusal: { kind: "unavailable" } };
          }
          const guarded = await gate.run({ kind: "open_cash_session" }, async (actor) => actor);
          if (guarded.kind !== "performed") {
            const refusal = guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted";
            return { kind: "refused", refusal: { kind: refusal } };
          }
          const openerId = guarded.result.signedInUserId;
          return { kind: "granted", grant: { openerId, opener: people.anyPerson(openerId) } };
        },
      },
    },
    { openingFloat },
  );
  if (outcome.kind !== "opened") {
    return { kind: outcome.kind };
  }
  const { openerId, opener } = outcome.grant;
  return { kind: "opened", cash_session: cashSessionAnswer(outcome.session, opener, openerId) };
}

export interface CloseCashSessionRequest {
  sessionId: string;
  countedCash: number;
}

type ClosingRefusal = Extract<
  CloseCashSessionOutcome,
  { kind: "unavailable" | "no_open_session" | "not_signed_in" | "lacks_permission" }
>;

export async function closeCashSessionFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  { sessionId, countedCash }: CloseCashSessionRequest,
): Promise<CloseCashSessionOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const outcome = await closeCashSession<ClosingRefusal>(
    {
      ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
      clock: { now },
      ids,
      authority: {
        async authorize(): Promise<OperationAuthorization<CloseCashSessionGrant, ClosingRefusal>> {
          if (outboxChainKey === undefined) {
            return { kind: "refused", refusal: { kind: "unavailable" } };
          }
          const open = readOpenSession(database);
          if (open === undefined) {
            return { kind: "refused", refusal: { kind: "no_open_session" } };
          }
          const guarded = await gate.run(
            { kind: "close_cash_session", session: open },
            async (actor) => actor,
          );
          return guarded.kind === "performed"
            ? { kind: "granted", grant: { closerId: guarded.result.signedInUserId } }
            : { kind: "refused", refusal: guarded };
        },
      },
    },
    { sessionId, countedCash },
  );
  return outcome.kind === "closed" ? closedAnswer(outcome.session) : outcome;
}

export interface CloseLockedCashSessionRequest {
  sessionId: string;
  countedCash: number;
  closer: Authorization;
}

type LockedClosingRefusal = Extract<
  CloseLockedCashSessionOutcome,
  { kind: "unavailable" | "no_open_session" | "not_locked" | AuthorizationRefusal["kind"] }
>;

export async function closeLockedCashSessionFor(
  { database, gate, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  { sessionId, countedCash, closer }: CloseLockedCashSessionRequest,
): Promise<CloseLockedCashSessionOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const outcome = await closeCashSession<LockedClosingRefusal>(
    {
      ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
      clock: { now },
      ids,
      authority: {
        async authorize(): Promise<
          OperationAuthorization<CloseCashSessionGrant, LockedClosingRefusal>
        > {
          if (outboxChainKey === undefined) {
            return { kind: "refused", refusal: { kind: "unavailable" } };
          }
          const open = readOpenSession(database);
          if (open === undefined) {
            return { kind: "refused", refusal: { kind: "no_open_session" } };
          }
          const guarded = await gate.runWhileLocked(
            { kind: "close_locked_register", session: open },
            closer,
            async (person) => person,
          );
          return guarded.kind === "performed"
            ? { kind: "granted", grant: { closerId: guarded.result.user_id } }
            : { kind: "refused", refusal: guarded };
        },
      },
    },
    { sessionId, countedCash },
  );
  return outcome.kind === "closed" ? closedAnswer(outcome.session) : outcome;
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
  return authorizersOf(new SqliteSignInStore(database), {
    kind: "operation",
    operation: { kind: "close_locked_register", session: open },
  });
}

function closedAnswer(
  session: ClosedCashSession,
): Extract<CloseCashSessionOutcome, { kind: "closed" }> {
  return {
    kind: "closed",
    session: {
      id: session.id,
      expected_cash: session.expectedCash,
      counted_cash: session.countedCash,
      difference: session.difference,
    },
  };
}

export function cashBalanceFor(database: LocalDatabase): CashBalance | null {
  const session = readOpenSession(database);
  if (session === undefined) {
    return null;
  }
  const balance = cashBreakdown(readSessionMovements(database, session.id));
  return {
    opening_float: balance.openingFloat.amount,
    cash_sales: balance.cashSales.amount,
    change_given: balance.changeGiven.amount,
    refunds: balance.refunds.amount,
    cash_in: balance.cashIn.amount,
    expenses: balance.expenses.amount,
    withdrawals: balance.withdrawals.amount,
    expected: balance.expected,
  };
}

export function sessionOpenSaleFor(database: LocalDatabase): SessionOpenSale | null {
  const session = readOpenSession(database);
  const sale = session && readOpenSale(database, session.id);
  return sale
    ? openSaleSummary({ lines: sale.lines, payments: readSalePayments(database, sale.id) })
    : null;
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
    opened_at: inArgentinaTime(session.openedAt),
    opened_by: {
      user_id: session.openedBy,
      first_name: opener.firstName,
      abilities: registerAbilities(opener.access),
    },
    locked: isLockedToAnother(session, signedInPersonId),
  };
}
