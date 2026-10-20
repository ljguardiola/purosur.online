import type { PinResetStore, PinResetStoreTransaction } from "../pin-reset-store.js";

export interface FakePinResetUser {
  id: string;
  hasPin: boolean;
}

interface FakePinResetAudit {
  actorId: string;
  userId: string;
}

export interface FakePinResetState {
  users: FakePinResetUser[];
  audits: FakePinResetAudit[];
}

class FakePinResetStoreTransaction implements PinResetStoreTransaction {
  private readonly store: FakePinResetStore;

  constructor(store: FakePinResetStore) {
    this.store = store;
  }

  async requirePinResetOfEveryUser(actorId: string): Promise<number> {
    let removed = 0;
    for (const user of this.store.current.users) {
      if (!user.hasPin) {
        continue;
      }
      user.hasPin = false;
      removed += 1;
      if (this.store.failAfterFirstRemoval) {
        throw new Error("requirePinResetOfEveryUser failed");
      }
      this.store.current.audits.push({ actorId, userId: user.id });
    }
    return removed;
  }
}

export class FakePinResetStore implements PinResetStore {
  private state: FakePinResetState = { users: [], audits: [] };

  failAfterFirstRemoval = false;

  get current(): FakePinResetState {
    return this.state;
  }

  seedUser(user: FakePinResetUser): void {
    this.state.users.push(structuredClone(user));
  }

  snapshot(): FakePinResetState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: PinResetStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakePinResetStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
