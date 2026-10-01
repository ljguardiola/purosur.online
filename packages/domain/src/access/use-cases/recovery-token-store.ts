export interface RecoveryAccount {
  id: string;
  active: boolean;
}

export interface RecoveryRequestKey {
  requestId: string;
  requestedAt: Date;
}

export interface RejectedRecoveryRequest {
  userId: string;
  reason: "account_inactive" | "superseded";
  requestedAt: Date;
}

export interface NewRecoveryToken {
  userId: string;
  tokenHash: string;
  requestedAt: Date;
  requestId: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface IssuedRecoveryToken {
  id: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface RecoveryRequestedAlert {
  userId: string;
  requestedAt: Date;
  issuedAt: Date;
  expiresAt: Date;
}

export interface RecoveryTokenStore {
  findAccountByEmail(email: string): Promise<RecoveryAccount | undefined>;
  recordRejectedRequest(rejection: RejectedRecoveryRequest): Promise<void>;
  transaction<TOutcome>(
    work: (tx: RecoveryTokenStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RecoveryTokenStoreTransaction {
  // Serializes the issuing of tokens for one account: whoever holds it decides alone.
  lockRecoveryTokens(userId: string): Promise<void>;
  // A token of the account requested at the same moment or later by another request.
  hasNewerRequest(userId: string, request: RecoveryRequestKey): Promise<boolean>;
  recordRejectedRequest(rejection: RejectedRecoveryRequest): Promise<void>;
  voidOutstandingRecoveryTokens(userId: string, at: Date): Promise<void>;
  issueToken(token: NewRecoveryToken): Promise<IssuedRecoveryToken>;
  recordIssuedToken(userId: string, token: IssuedRecoveryToken, requestedAt: Date): Promise<void>;
  openRecoveryRequestedAlert(alert: RecoveryRequestedAlert): Promise<void>;
}
