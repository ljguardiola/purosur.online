import type {
  CompromiseResponseAction,
  CompromiseResponseItem,
} from "../../model/compromise-response.js";
import type {
  CompromiseResponseStore,
  CompromiseResponseStoreTransaction,
  CompromiseResponses,
  StoredCompromiseResponse,
} from "../compromise-response-store.js";

type FakeCompromiseResponseAudit =
  | { kind: "started"; responseId: string; actorId: string; at: Date }
  | { kind: "step_done"; responseId: string; step: string; actorId: string; at: Date }
  | { kind: "item_done"; responseId: string; item: string; actorId: string; at: Date };

export interface FakeCompromiseResponseState {
  responses: StoredCompromiseResponse[];
  audits: FakeCompromiseResponseAudit[];
}

type FailableWrite = "startResponse" | "recordStepDone" | "recordItemDone";

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
}

export class FakeCompromiseResponseStore implements CompromiseResponseStore, CompromiseResponses {
  private state: FakeCompromiseResponseState = { responses: [], audits: [] };

  failingWrites = new Set<FailableWrite>();

  get current(): FakeCompromiseResponseState {
    return this.state;
  }

  seedResponse(response: StoredCompromiseResponse): void {
    this.state.responses.push(structuredClone(response));
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

  async transaction<TOutcome>(
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
