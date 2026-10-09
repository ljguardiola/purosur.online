import type { RecoveryRequest } from "../model/recovery-token.js";

export interface RecoveryAccount {
  id: string;
  active: boolean;
}

export type { RecoveryRequest } from "../model/recovery-token.js";

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
  transaction<TOutcome>(
    work: (tx: RecoveryTokenStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RecoveryTokenStoreTransaction {
  findAccountByEmail(email: string): Promise<RecoveryAccount | undefined>;
  // Serializes the issuing of tokens for one account: whoever holds it decides alone.
  lockRecoveryTokens(userId: string): Promise<void>;
  listRecoveryRequests(userId: string): Promise<RecoveryRequest[]>;
  recordRejectedRequest(rejection: RejectedRecoveryRequest): Promise<void>;
  voidOutstandingRecoveryTokens(userId: string, at: Date): Promise<void>;
  issueToken(token: NewRecoveryToken): Promise<IssuedRecoveryToken>;
  recordIssuedToken(userId: string, token: IssuedRecoveryToken, requestedAt: Date): Promise<void>;
  openRecoveryRequestedAlert(alert: RecoveryRequestedAlert): Promise<void>;
}
