import type {
  FirstAdministratorLocation,
  FirstAdministratorRole,
  FirstAdministratorStore,
  FirstAdministratorStoreTransaction,
  NewFirstAdministrator,
  StoredFirstAdministrator,
} from "../first-administrator-store.js";

export interface FakeFirstAdministratorState {
  users: (NewFirstAdministrator & { id: string })[];
  roleAssignments: { userId: string; roleId: string }[];
  records: { userId: string; firstName: string; email: string; roleId: string }[];
}

class FakeFirstAdministratorStoreTransaction implements FirstAdministratorStoreTransaction {
  private readonly store: FakeFirstAdministratorStore;

  constructor(store: FakeFirstAdministratorStore) {
    this.store = store;
  }

  async lockUsers(): Promise<void> {
    this.store.operationOrder.push("lockUsers");
  }

  async anyUserExists(): Promise<boolean> {
    this.store.operationOrder.push("anyUserExists");
    return this.store.current.users.length > 0;
  }

  async findAdministratorRole(): Promise<FirstAdministratorRole | undefined> {
    this.store.operationOrder.push("findAdministratorRole");
    return this.store.administratorRole;
  }

  async findLocation(): Promise<FirstAdministratorLocation | undefined> {
    this.store.operationOrder.push("findLocation");
    return this.store.location;
  }

  async insertUser(user: NewFirstAdministrator): Promise<StoredFirstAdministrator> {
    this.store.operationOrder.push("insertUser");
    const id = `user-${this.store.current.users.length + 1}`;
    this.store.current.users.push({ ...user, id });
    return { id };
  }

  async assignRole(userId: string, roleId: string): Promise<void> {
    this.store.operationOrder.push("assignRole");
    this.store.current.roleAssignments.push({ userId, roleId });
  }

  async recordFirstAdministrator(
    userId: string,
    created: { firstName: string; email: string; roleId: string },
  ): Promise<void> {
    this.store.operationOrder.push("recordFirstAdministrator");
    this.store.current.records.push({ userId, ...created });
  }
}

export class FakeFirstAdministratorStore implements FirstAdministratorStore {
  private state: FakeFirstAdministratorState = { users: [], roleAssignments: [], records: [] };

  administratorRole: FirstAdministratorRole | undefined = { id: "role-admin" };
  location: FirstAdministratorLocation | undefined = { id: "loc-1" };
  operationOrder: string[] = [];
  transactionCount = 0;

  get current(): FakeFirstAdministratorState {
    return this.state;
  }

  seedUser(user: NewFirstAdministrator & { id: string }): void {
    this.state.users.push(structuredClone(user));
  }

  snapshot(): FakeFirstAdministratorState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: FirstAdministratorStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeFirstAdministratorStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
