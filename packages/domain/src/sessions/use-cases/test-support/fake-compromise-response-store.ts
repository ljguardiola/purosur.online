import type {
  CompromiseResponseAction,
  CompromiseResponseItem,
  PasskeyRemovalRefusal,
  PasskeyRemovalResult,
} from "../../model/compromise-response.js";
import type {
  AccountPasskeyRemoval,
  CompromiseResponseStore,
  CompromiseResponseStoreTransaction,
  CompromiseResponses,
  InstallationRevocationResult,
  StoredCompromiseResponse,
} from "../compromise-response-store.js";

type FakeCompromiseResponseAudit =
  | { kind: "started"; responseId: string; actorId: string; at: Date }
  | { kind: "step_done"; responseId: string; step: string; actorId: string; at: Date }
  | { kind: "item_done"; responseId: string; item: string; actorId: string; at: Date };

export interface FakeCompromiseResponseState {
  responses: StoredCompromiseResponse[];
  audits: FakeCompromiseResponseAudit[];
  accountsWithPasskeys: string[];
  effects: string[];
}

type FailableWrite =
  | "startResponse"
  | "recordStepDone"
  | "recordItemDone"
  | "revokeEveryInstallation"
  | "removeEveryPasskeyOf"
  | "endEveryBackofficeSession"
  | "requirePinResetOfEveryUser";

class FakeCompromiseResponseStoreTransaction implements CompromiseResponseStoreTransaction {
  private readonly store: FakeCompromiseResponseStore;

  constructor(store: FakeCompromiseResponseStore) {
    this.store = store;
  }

  async lockLatestResponse(): Promise<StoredCompromiseResponse | null> {
    return structuredClone(this.store.current.responses.at(-1) ?? null);
  }

  async startResponse(actorId: string, at: Date): Promise<StoredCompromiseResponse> {
    this.store.failIfAsked("startResponse");
    const response: StoredCompromiseResponse = {
      id: `response-${this.store.current.responses.length + 1}`,
      startedAt: at,
      startedBy: actorId,
      completions: [],
    };
    this.store.current.responses.push(response);
    this.store.current.audits.push({ kind: "started", responseId: response.id, actorId, at });
    return structuredClone(response);
  }

  async recordStepDone(
    responseId: string,
    step: CompromiseResponseAction,
    actorId: string,
    at: Date,
  ): Promise<void> {
    this.store.failIfAsked("recordStepDone");
    this.store.responseById(responseId).completions.push({ key: step, at });
    this.store.current.audits.push({ kind: "step_done", responseId, step, actorId, at });
  }

  async recordItemDone(
    responseId: string,
    item: CompromiseResponseItem,
    actorId: string,
    at: Date,
  ): Promise<void> {
    this.store.failIfAsked("recordItemDone");
    this.store.responseById(responseId).completions.push({ key: item, at });
    this.store.current.audits.push({ kind: "item_done", responseId, item, actorId, at });
  }

  async revokeEveryInstallation(actorId: string, at: Date): Promise<InstallationRevocationResult> {
    this.store.current.effects.push(`revokeEveryInstallation:${actorId}:${at.toISOString()}`);
    this.store.failIfAsked("revokeEveryInstallation");
    return this.store.installationRevocation;
  }

  async removeEveryPasskeyOf(removal: AccountPasskeyRemoval): Promise<PasskeyRemovalResult> {
    this.store.passkeyRemovalRequests.push(structuredClone(removal));
    if (this.store.passkeyRemovalRefusal !== null) {
      return this.store.passkeyRemovalRefusal;
    }
    const { accountsWithPasskeys, effects } = this.store.current;
    if (!accountsWithPasskeys.includes(removal.accountId)) {
      return "no_passkeys";
    }
    this.store.current.accountsWithPasskeys = accountsWithPasskeys.filter(
      (account) => account !== removal.accountId,
    );
    effects.push(`removeEveryPasskeyOf:${removal.accountId}:${removal.administratorId}`);
    this.store.failIfAsked("removeEveryPasskeyOf");
    return "removed";
  }

  async endEveryBackofficeSession(actorId: string, at: Date): Promise<void> {
    this.store.current.effects.push(`endEveryBackofficeSession:${actorId}:${at.toISOString()}`);
    this.store.failIfAsked("endEveryBackofficeSession");
  }

  async requirePinResetOfEveryUser(actorId: string, at: Date): Promise<void> {
    this.store.current.effects.push(`requirePinResetOfEveryUser:${actorId}:${at.toISOString()}`);
    this.store.failIfAsked("requirePinResetOfEveryUser");
  }
}

export class FakeCompromiseResponseStore implements CompromiseResponseStore, CompromiseResponses {
  private state: FakeCompromiseResponseState = {
    responses: [],
    audits: [],
    accountsWithPasskeys: [],
    effects: [],
  };

  private turn: Promise<unknown> = Promise.resolve();

  failingWrites = new Set<FailableWrite>();

  installationRevocation: InstallationRevocationResult = "revoked";

  passkeyRemovalRefusal: PasskeyRemovalRefusal | null = null;

  readonly passkeyRemovalRequests: AccountPasskeyRemoval[] = [];

  get current(): FakeCompromiseResponseState {
    return this.state;
  }

  seedResponse(response: StoredCompromiseResponse): void {
    this.state.responses.push(structuredClone(response));
  }

  seedAccountWithPasskeys(accountId: string): void {
    this.state.accountsWithPasskeys.push(accountId);
  }

  snapshot(): FakeCompromiseResponseState {
    return structuredClone(this.state);
  }

  responseById(id: string): StoredCompromiseResponse {
    const response = this.state.responses.find((candidate) => candidate.id === id);
    if (!response) {
      throw new Error(`no response ${id}`);
    }
    return response;
  }

  failIfAsked(write: FailableWrite): void {
    if (this.failingWrites.has(write)) {
      throw new Error(`${write} failed`);
    }
  }

  async findLatestResponse(): Promise<StoredCompromiseResponse | null> {
    return structuredClone(this.state.responses.at(-1) ?? null);
  }

  transaction<TOutcome>(
    work: (tx: CompromiseResponseStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const outcome = this.turn.then(() => this.runRolledBackOnFailure(work));
    this.turn = outcome.catch(() => undefined);
    return outcome;
  }

  private async runRolledBackOnFailure<TOutcome>(
    work: (tx: CompromiseResponseStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeCompromiseResponseStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
