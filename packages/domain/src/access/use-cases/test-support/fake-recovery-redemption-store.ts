import {
  PasskeyAlreadyRegistered,
  type RecoveredPasskey,
  type RecoveringAccount,
  type RecoveryPasskeyAlert,
  type RecoveryRedemptionStore,
  type RecoveryRedemptionStoreTransaction,
  type RecoveryTokenRecord,
  type RegisteredCredential,
  type RegisteredPasskey,
  type RejectedRedemption,
} from "../recovery-redemption-store.js";

export interface FakeRecoveryToken extends RecoveryTokenRecord {
  tokenHash: string;
}

export interface FakeStoredPasskey extends RecoveredPasskey {
  id: string;
}

export interface FakeSession {
  id: string;
  userId: string;
  revokedAt: Date | null;
}

export interface FakeRecoveryRedemptionState {
  accounts: RecoveringAccount[];
  tokens: FakeRecoveryToken[];
  passkeys: FakeStoredPasskey[];
  sessions: FakeSession[];
  challenges: { tokenId: string; challenge: string }[];
  rejectedRedemptions: RejectedRedemption[];
  redeemedTokenRecords: { tokenId: string; userId: string; at: Date }[];
  passkeyRecords: { userId: string; passkeyId: string; name: string }[];
  alerts: RecoveryPasskeyAlert[];
}

type WriteOperation =
  | "recordRegistrationChallenge"
  | "recordRejectedRedemption"
  | "burnToken"
  | "registerPasskey"
  | "recordTokenRedeemed"
  | "recordPasskeyRegistered"
  | "openPasskeyRegisteredAlert"
  | "revokeSessions";

class FakeRecoveryRedemptionStoreTransaction implements RecoveryRedemptionStoreTransaction {
  private readonly store: FakeRecoveryRedemptionStore;

  constructor(store: FakeRecoveryRedemptionStore) {
    this.store = store;
  }

  private get state(): FakeRecoveryRedemptionState {
    return this.store.current;
  }

  async burnToken(tokenId: string, at: Date): Promise<boolean> {
    this.store.beforeWrite("burnToken");
    if (this.store.burnRaceLost) {
      return false;
    }
    const token = this.state.tokens.find((candidate) => candidate.id === tokenId);
    if (
      !token ||
      token.usedAt !== null ||
      token.voidedAt !== null ||
      token.expiresAt.getTime() <= at.getTime()
    ) {
      return false;
    }
    token.usedAt = at;
    return true;
  }

  async registerPasskey(passkey: RecoveredPasskey): Promise<RegisteredPasskey> {
    this.store.beforeWrite("registerPasskey");
    if (this.state.passkeys.some((held) => held.credentialId === passkey.credentialId)) {
      throw new PasskeyAlreadyRegistered();
    }
    const id = `passkey-${this.state.passkeys.length + 1}`;
    this.state.passkeys.push({ ...structuredClone(passkey), id });
    return { id };
  }

  async recordTokenRedeemed(tokenId: string, userId: string, at: Date): Promise<void> {
    this.store.beforeWrite("recordTokenRedeemed");
    this.state.redeemedTokenRecords.push({ tokenId, userId, at });
  }

  async recordPasskeyRegistered(
    userId: string,
    passkey: RegisteredPasskey,
    details: RecoveredPasskey,
  ): Promise<void> {
    this.store.beforeWrite("recordPasskeyRegistered");
    this.state.passkeyRecords.push({ userId, passkeyId: passkey.id, name: details.name });
  }

  async openPasskeyRegisteredAlert(alert: RecoveryPasskeyAlert): Promise<void> {
    this.store.beforeWrite("openPasskeyRegisteredAlert");
    this.state.alerts.push(structuredClone(alert));
  }

  async revokeSessions(userId: string, at: Date): Promise<void> {
    this.store.beforeWrite("revokeSessions");
    for (const session of this.state.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        session.revokedAt = at;
      }
    }
  }
}

export class FakeRecoveryRedemptionStore implements RecoveryRedemptionStore {
  private state: FakeRecoveryRedemptionState = {
    accounts: [],
    tokens: [],
    passkeys: [],
    sessions: [],
    challenges: [],
    rejectedRedemptions: [],
    redeemedTokenRecords: [],
    passkeyRecords: [],
    alerts: [],
  };

  failingWrites = new Set<WriteOperation>();
  burnRaceLost = false;
  operationOrder: string[] = [];

  get current(): FakeRecoveryRedemptionState {
    return this.state;
  }

  seedAccount(account: RecoveringAccount): void {
    this.state.accounts.push(structuredClone(account));
  }

  seedToken(token: FakeRecoveryToken): void {
    this.state.tokens.push(structuredClone(token));
  }

  seedPasskey(passkey: FakeStoredPasskey): void {
    this.state.passkeys.push(structuredClone(passkey));
  }

  seedSession(session: FakeSession): void {
    this.state.sessions.push(structuredClone(session));
  }

  snapshot(): FakeRecoveryRedemptionState {
    return structuredClone(this.state);
  }

  async findTokenByHash(tokenHash: string): Promise<RecoveryTokenRecord | undefined> {
    const token = this.state.tokens.find((candidate) => candidate.tokenHash === tokenHash);
    if (!token) {
      return undefined;
    }
    return {
      id: token.id,
      userId: token.userId,
      expiresAt: new Date(token.expiresAt),
      usedAt: token.usedAt && new Date(token.usedAt),
      voidedAt: token.voidedAt && new Date(token.voidedAt),
      registrationChallenge: token.registrationChallenge,
    };
  }

  async findAccount(userId: string): Promise<RecoveringAccount | undefined> {
    return structuredClone(this.state.accounts.find((account) => account.id === userId));
  }

  async listRegisteredCredentials(userId: string): Promise<RegisteredCredential[]> {
    return this.state.passkeys
      .filter((passkey) => passkey.userId === userId)
      .map((passkey) => ({
        credentialId: passkey.credentialId,
        transports: structuredClone(passkey.transports),
      }));
  }

  async recordRegistrationChallenge(tokenId: string, challenge: string): Promise<void> {
    this.beforeWrite("recordRegistrationChallenge");
    this.state.challenges.push({ tokenId, challenge });
  }

  async recordRejectedRedemption(rejection: RejectedRedemption): Promise<void> {
    this.beforeWrite("recordRejectedRedemption");
    this.state.rejectedRedemptions.push(structuredClone(rejection));
  }

  beforeWrite(operation: WriteOperation): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async transaction<TOutcome>(
    work: (tx: RecoveryRedemptionStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeRecoveryRedemptionStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
