import type {
  CarriedSyncIdentity,
  RestoredSyncIdentityStore,
  RestoredSyncIdentityTransaction,
} from "../restored-sync-identity-ports.js";

export interface RestoredRegisterState {
  identity: {
    deviceId: string;
    outboxSequenceCounter: number;
    acknowledgedSeq: number;
    eventChainHead: string | null;
  };
  predecessor: CarriedSyncIdentity | undefined;
  outboxDeviceSeqs: number[];
  pullCursor: number;
  pinVerifiers: string[];
  wrongPinAttempts: number;
}

export type FakeStoreOperation =
  | "recordPredecessor"
  | "discardCarriedOutboxEvents"
  | "adoptInstallationIdentity"
  | "discardCarriedPinVerifiers";

export function aSnapshotOfAnOldInstallation(): RestoredRegisterState {
  return {
    identity: {
      deviceId: "old-device",
      outboxSequenceCounter: 57,
      acknowledgedSeq: 52,
      eventChainHead: "old-chain-head",
    },
    predecessor: undefined,
    outboxDeviceSeqs: [51, 52, 53, 54, 55, 56, 57],
    pullCursor: 4_321,
    pinVerifiers: ["verifier-1", "verifier-2"],
    wrongPinAttempts: 3,
  };
}

export class FakeRestoredSyncIdentityStore implements RestoredSyncIdentityStore {
  state: RestoredRegisterState;
  transactions = 0;
  failAt: FakeStoreOperation | undefined;

  constructor(state: RestoredRegisterState = aSnapshotOfAnOldInstallation()) {
    this.state = structuredClone(state);
  }

  async transaction<TOutcome>(
    work: (tx: RestoredSyncIdentityTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const failIf = (operation: FakeStoreOperation) => {
      if (this.failAt === operation) {
        throw new Error("storage unavailable");
      }
    };
    const tx: RestoredSyncIdentityTransaction = {
      carriedIdentity: async () => ({
        deviceId: working.identity.deviceId,
        lastAcknowledgedSeq: working.identity.acknowledgedSeq,
      }),
      recordPredecessor: async (predecessor) => {
        failIf("recordPredecessor");
        working.predecessor = { ...predecessor };
      },
      discardCarriedOutboxEvents: async () => {
        failIf("discardCarriedOutboxEvents");
        working.outboxDeviceSeqs = [];
      },
      adoptInstallationIdentity: async (deviceId) => {
        failIf("adoptInstallationIdentity");
        working.identity = {
          deviceId,
          outboxSequenceCounter: 0,
          acknowledgedSeq: 0,
          eventChainHead: null,
        };
      },
      discardCarriedPinVerifiers: async () => {
        failIf("discardCarriedPinVerifiers");
        working.pinVerifiers = [];
        working.wrongPinAttempts = 0;
      },
    };
    const outcome = await work(tx);
    this.state = working;
    return outcome;
  }
}
