import type { RoleAccess } from "../../../permissions/index.js";
import type { OutboxEventDraft } from "../../../shared/index.js";
import type { CashMovement, CashSession, OpenedCashSession } from "../../model/cash-session.js";
import type {
  CashLedger,
  CashLedgerTransaction,
  IdGenerator,
  OpenSale,
  RegisterIdentity,
} from "../cash-ledger.js";

export interface FakeCashLedgerState {
  accesses: Record<string, RoleAccess>;
  identity: RegisterIdentity | undefined;
  sessions: CashSession[];
  movements: CashMovement[];
  openSale: OpenSale | undefined;
  outbox: OutboxEventDraft[];
}

export type FakeCashLedgerWrite =
  | "recordOpenedSession"
  | "recordClosedSession"
  | "recordCashMovement"
  | "appendOutboxEvent";

export class FakeCashLedger implements CashLedger {
  state: FakeCashLedgerState;
  transactions = 0;
  failOn: FakeCashLedgerWrite | undefined;

  constructor(state: Partial<FakeCashLedgerState> = {}) {
    this.state = {
      accesses: {},
      identity: undefined,
      sessions: [],
      movements: [],
      openSale: undefined,
      outbox: [],
      ...state,
    };
  }

  transaction<TOutcome>(work: (tx: CashLedgerTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const outcome = work({
      openerAccess: (userId) => working.accesses[userId],
      openSession: () =>
        working.sessions.find((session): session is OpenedCashSession => session.state === "OPEN"),
      openSale: () => working.openSale,
      sessionMovements: (sessionId) =>
        working.movements.filter((movement) => movement.sessionId === sessionId),
      registerIdentity: () => working.identity,
      recordOpenedSession: (session) => {
        this.failIfAsked("recordOpenedSession");
        working.sessions.push(session);
      },
      recordClosedSession: (session) => {
        this.failIfAsked("recordClosedSession");
        working.sessions = working.sessions.map((existing) =>
          existing.id === session.id ? session : existing,
        );
      },
      recordCashMovement: (movement) => {
        this.failIfAsked("recordCashMovement");
        working.movements.push(movement);
      },
      appendOutboxEvent: (draft) => {
        this.failIfAsked("appendOutboxEvent");
        working.outbox.push(draft);
      },
    });
    this.state = working;
    return outcome;
  }

  private failIfAsked(write: FakeCashLedgerWrite): void {
    if (this.failOn === write) {
      throw new Error(`${write} failed`);
    }
  }
}

export class SequentialIds implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `id-${this.count}`;
  }
}
