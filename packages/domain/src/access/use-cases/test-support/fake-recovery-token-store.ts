import type {
  IssuedRecoveryToken,
  NewRecoveryToken,
  RecoveryAccount,
  RecoveryRequest,
  RecoveryRequestedAlert,
  RecoveryTokenStore,
  RecoveryTokenStoreTransaction,
  RejectedRecoveryRequest,
} from "../recovery-token-store.js";

export interface FakeRecoveryAccount extends RecoveryAccount {
  email: string;
}

export interface FakeRecoveryToken extends NewRecoveryToken {
  id: string;
  usedAt: Date | null;
  voidedAt: Date | null;
}

export interface FakeRecoveryTokenStoreState {
  accounts: FakeRecoveryAccount[];
  tokens: FakeRecoveryToken[];
  rejectedRequests: RejectedRecoveryRequest[];
  issuedTokenRecords: { userId: string; tokenId: string; requestedAt: Date }[];
  alerts: RecoveryRequestedAlert[];
}

type WriteOperation =
  | "recordRejectedRequest"
  | "voidOutstandingRecoveryTokens"
  | "issueToken"
  | "recordIssuedToken"
  | "openRecoveryRequestedAlert";

class FakeRecoveryTokenStoreTransaction implements RecoveryTokenStoreTransaction {
  private readonly store: FakeRecoveryTokenStore;

  constructor(store: FakeRecoveryTokenStore) {
    this.store = store;
  }

  private get state(): FakeRecoveryTokenStoreState {
    return this.store.current;
  }

  async findAccountByEmail(email: string): Promise<RecoveryAccount | undefined> {
    this.store.operationOrder.push("findAccountByEmail");
    const account = this.state.accounts.find((candidate) => candidate.email === email);
    return account && { id: account.id, active: account.active };
  }

  async lockRecoveryTokens(userId: string): Promise<void> {
    this.store.operationOrder.push(`lockRecoveryTokens:${userId}`);
  }

  async listRecoveryRequests(userId: string): Promise<RecoveryRequest[]> {
    this.store.operationOrder.push("listRecoveryRequests");
    return this.state.tokens
      .filter((token) => token.userId === userId)
      .map(({ requestId, requestedAt }) => ({ requestId, requestedAt: new Date(requestedAt) }));
  }

  async recordRejectedRequest(rejection: RejectedRecoveryRequest): Promise<void> {
    this.beforeWrite("recordRejectedRequest");
    this.state.rejectedRequests.push(structuredClone(rejection));
  }

  async voidOutstandingRecoveryTokens(userId: string, at: Date): Promise<void> {
    this.beforeWrite("voidOutstandingRecoveryTokens");
    for (const token of this.state.tokens) {
      if (token.userId === userId && token.usedAt === null && token.voidedAt === null) {
        token.voidedAt = at;
      }
    }
  }

  async issueToken(token: NewRecoveryToken): Promise<IssuedRecoveryToken> {
    this.beforeWrite("issueToken");
    const id = `token-${this.state.tokens.length + 1}`;
    this.state.tokens.push({ ...structuredClone(token), id, usedAt: null, voidedAt: null });
    return { id, issuedAt: token.issuedAt, expiresAt: token.expiresAt };
  }

  async recordIssuedToken(
    userId: string,
    token: IssuedRecoveryToken,
    requestedAt: Date,
  ): Promise<void> {
    this.beforeWrite("recordIssuedToken");
    this.state.issuedTokenRecords.push({ userId, tokenId: token.id, requestedAt });
  }

  async openRecoveryRequestedAlert(alert: RecoveryRequestedAlert): Promise<void> {
    this.beforeWrite("openRecoveryRequestedAlert");
    this.state.alerts.push(structuredClone(alert));
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.beforeWrite(operation);
  }
}

export class FakeRecoveryTokenStore implements RecoveryTokenStore {
  private state: FakeRecoveryTokenStoreState = {
    accounts: [],
    tokens: [],
    rejectedRequests: [],
    issuedTokenRecords: [],
    alerts: [],
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  transactionCount = 0;

  get current(): FakeRecoveryTokenStoreState {
    return this.state;
  }

  seedAccount(account: FakeRecoveryAccount): void {
    this.state.accounts.push(structuredClone(account));
  }

  seedToken(token: FakeRecoveryToken): void {
    this.state.tokens.push(structuredClone(token));
  }

  snapshot(): FakeRecoveryTokenStoreState {
    return structuredClone(this.state);
  }

  beforeWrite(operation: WriteOperation): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async transaction<TOutcome>(
    work: (tx: RecoveryTokenStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeRecoveryTokenStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
