import type { RoleAccess } from "../../../access/index.js";
import type { OutboxEventDraft } from "../../../sync/index.js";
import type { CashMovement, CashSession } from "../../model/cash-session.js";
import type {
  CashLedger,
  CashLedgerTransaction,
  IdGenerator,
  RegisterIdentity,
} from "../cash-ledger.js";

export interface FakeCashLedgerState {
  accesses: Record<string, RoleAccess>;
  identity: RegisterIdentity | undefined;
  sessions: CashSession[];
  movements: CashMovement[];
  outbox: OutboxEventDraft[];
}

export type FakeCashLedgerWrite =
  | "recordOpenedSession"
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
      outbox: [],
      ...state,
    };
  }

  transaction<TOutcome>(work: (tx: CashLedgerTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const outcome = work({
      openerAccess: (userId) => working.accesses[userId],
      openSession: () => working.sessions.find((session) => session.state === "OPEN"),
      registerIdentity: () => working.identity,
      recordOpenedSession: (session) => {
        this.failIfAsked("recordOpenedSession");
        working.sessions.push(session);
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
