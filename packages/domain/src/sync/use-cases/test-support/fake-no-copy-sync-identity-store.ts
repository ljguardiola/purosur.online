import type {
  NoCopySyncIdentityStore,
  NoCopySyncIdentityTransaction,
} from "../reset-sync-identity-without-copy-ports.js";

export interface FreshRegisterState {
  heldDeviceId: string | undefined;
  predecessor: { deviceId: string; lastAcknowledgedSeq: number; origin: "no_copy" } | undefined;
  identity: { deviceId: string; outboxSequenceCounter: number; eventChainHead: string | null };
  pullCursor: number;
  awaitingRestoredNumbering: string[];
  awaitingOrphanSweep: string[];
}

export type NoCopyStoreOperation =
  | "recordPredecessor"
  | "adoptInstallationIdentity"
  | "awaitRestoredNumbering";

export function aFreshInstallationHoldingNothing(): FreshRegisterState {
  return {
    heldDeviceId: undefined,
    predecessor: undefined,
    identity: { deviceId: "", outboxSequenceCounter: 0, eventChainHead: null },
    pullCursor: 0,
    awaitingRestoredNumbering: [],
    awaitingOrphanSweep: [],
  };
}

export class FakeNoCopySyncIdentityStore implements NoCopySyncIdentityStore {
  state: FreshRegisterState;
  transactions = 0;
  operations: NoCopyStoreOperation[] = [];
  failAt: NoCopyStoreOperation | undefined;

  constructor(state: FreshRegisterState = aFreshInstallationHoldingNothing()) {
    this.state = structuredClone(state);
  }

  async transaction<TOutcome>(
    work: (tx: NoCopySyncIdentityTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const performed: NoCopyStoreOperation[] = [];
    const step = (operation: NoCopyStoreOperation) => {
      if (this.failAt === operation) {
        throw new Error("storage unavailable");
      }
      performed.push(operation);
    };
    const tx: NoCopySyncIdentityTransaction = {
      heldDeviceId: async () => working.heldDeviceId,
      recordPredecessor: async (predecessor) => {
        step("recordPredecessor");
        working.predecessor = { ...predecessor, origin: "no_copy" };
      },
      adoptInstallationIdentity: async (deviceId) => {
        step("adoptInstallationIdentity");
        working.heldDeviceId = deviceId;
        working.identity = { deviceId, outboxSequenceCounter: 0, eventChainHead: null };
      },
      awaitRestoredNumbering: async (registerId) => {
        step("awaitRestoredNumbering");
        working.awaitingRestoredNumbering.push(registerId);
        working.awaitingOrphanSweep.push(registerId);
      },
    };
    const outcome = await work(tx);
    this.state = working;
    this.operations = performed;
    return outcome;
  }
}
