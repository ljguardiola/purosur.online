import type {
  AddedPasskey,
  PasskeyRegistrationAlert,
  PasskeyRegistrationStore,
  PasskeyRegistrationStoreTransaction,
} from "../passkey-registration-store.js";
import {
  PasskeyAlreadyRegistered,
  type RecoveredPasskey,
  type RegisteredPasskey,
} from "../recovery-redemption-store.js";

export interface FakeHeldPasskey extends RecoveredPasskey {
  id: string;
}

export interface FakeRegistrationAudit {
  userId: string;
  passkeyId: string;
  details: RecoveredPasskey;
}

export interface FakePasskeyRegistrationState {
  passkeys: FakeHeldPasskey[];
  audits: FakeRegistrationAudit[];
  alerts: PasskeyRegistrationAlert[];
}

type WriteOperation = "addPasskey" | "recordPasskeyRegistered" | "openPasskeyRegisteredAlert";

class FakePasskeyRegistrationStoreTransaction implements PasskeyRegistrationStoreTransaction {
  private readonly store: FakePasskeyRegistrationStore;

  constructor(store: FakePasskeyRegistrationStore) {
    this.store = store;
  }

  private get state(): FakePasskeyRegistrationState {
    return this.store.current;
  }

  async addPasskey(passkey: RecoveredPasskey): Promise<AddedPasskey> {
    this.store.beforeWrite("addPasskey");
    if (this.state.passkeys.some((held) => held.credentialId === passkey.credentialId)) {
      throw new PasskeyAlreadyRegistered();
    }
    const id = `passkey-${this.state.passkeys.length + 1}`;
    this.state.passkeys.push({ ...structuredClone(passkey), id });
    return { id, createdAt: this.store.createdAt };
  }

  async recordPasskeyRegistered(
    userId: string,
    passkey: RegisteredPasskey,
    details: RecoveredPasskey,
  ): Promise<void> {
    this.store.beforeWrite("recordPasskeyRegistered");
    this.state.audits.push({ userId, passkeyId: passkey.id, details: structuredClone(details) });
  }

  async openPasskeyRegisteredAlert(alert: PasskeyRegistrationAlert): Promise<void> {
    this.store.beforeWrite("openPasskeyRegisteredAlert");
    this.state.alerts.push(structuredClone(alert));
  }
}

export class FakePasskeyRegistrationStore implements PasskeyRegistrationStore {
  private state: FakePasskeyRegistrationState = { passkeys: [], audits: [], alerts: [] };

  createdAt = new Date("2026-10-01T12:00:00.000Z");
  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];

  get current(): FakePasskeyRegistrationState {
    return this.state;
  }

  seedPasskey(passkey: FakeHeldPasskey): void {
    this.state.passkeys.push(structuredClone(passkey));
  }

  snapshot(): FakePasskeyRegistrationState {
    return structuredClone(this.state);
  }

  beforeWrite(operation: WriteOperation): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async transaction<TOutcome>(
    work: (tx: PasskeyRegistrationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakePasskeyRegistrationStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
