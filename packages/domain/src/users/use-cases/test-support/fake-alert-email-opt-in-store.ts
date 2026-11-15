import type {
  AlertEmailOptInStore,
  AlertEmailOptInStoreTransaction,
  RecipientsChangedAlert,
} from "../alert-email-opt-in-store.js";
import type { UserChange } from "../user-store.js";

export interface FakeOptInUser {
  id: string;
  locationId: string;
  active: boolean;
  alertEmailOptedInAt: Date | null;
}

interface RecordedUserChange {
  userId: string;
  actorId: string;
  change: UserChange;
}

export interface FakeAlertEmailOptInState {
  users: FakeOptInUser[];
  changes: RecordedUserChange[];
  alerts: RecipientsChangedAlert[];
}

type WriteOperation =
  | "recordOptIn"
  | "clearOptIn"
  | "recordUserChange"
  | "openRecipientsChangedAlert";

class FakeAlertEmailOptInStoreTransaction implements AlertEmailOptInStoreTransaction {
  private readonly store: FakeAlertEmailOptInStore;

  constructor(store: FakeAlertEmailOptInStore) {
    this.store = store;
  }

  private get state(): FakeAlertEmailOptInState {
    return this.store.current;
  }

  async lockBranchUserOptIn(
    userId: string,
    locationId: string,
  ): Promise<{ optedInAt: Date | null } | undefined> {
    this.store.operationOrder.push("lockBranchUserOptIn");
    const found = this.state.users.find(
      (user) => user.id === userId && user.locationId === locationId && user.active,
    );
    return found && { optedInAt: found.alertEmailOptedInAt };
  }

  async recordOptIn(userId: string, at: Date): Promise<void> {
    this.beforeWrite("recordOptIn");
    this.requireUser(userId).alertEmailOptedInAt = at;
  }

  async clearOptIn(userId: string): Promise<void> {
    this.beforeWrite("clearOptIn");
    this.requireUser(userId).alertEmailOptedInAt = null;
  }

  async recordUserChange(userId: string, actorId: string, change: UserChange): Promise<void> {
    this.beforeWrite("recordUserChange");
    this.state.changes.push({ userId, actorId, change: structuredClone(change) });
  }

  async openRecipientsChangedAlert(alert: RecipientsChangedAlert): Promise<void> {
    this.beforeWrite("openRecipientsChangedAlert");
    this.state.alerts.push(structuredClone(alert));
  }

  private requireUser(userId: string): FakeOptInUser {
    const user = this.state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new Error("writing a user that does not exist");
    }
    return user;
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeAlertEmailOptInStore implements AlertEmailOptInStore {
  private state: FakeAlertEmailOptInState = { users: [], changes: [], alerts: [] };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];

  get current(): FakeAlertEmailOptInState {
    return this.state;
  }

  seedUser(user: FakeOptInUser): void {
    this.state.users.push(structuredClone(user));
  }

  snapshot(): FakeAlertEmailOptInState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: AlertEmailOptInStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeAlertEmailOptInStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
