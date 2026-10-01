export class PasskeyAlreadyRegistered extends Error {}

export type RecoveryAttempt = "registration_options" | "redeem";

export type RecoveryRejection =
  | "invalid"
  | "burned"
  | "expired"
  | "validation_failed"
  | "passkey_already_registered";

export interface RecoveryTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  voidedAt: Date | null;
  registrationChallenge: string | null;
}

export interface RecoveringAccount {
  id: string;
  firstName: string;
  email: string;
  active: boolean;
}

export interface RegisteredCredential {
  credentialId: string;
  transports: string[] | null;
}

export interface RejectedRedemption {
  tokenId: string;
  userId: string;
  attempt: RecoveryAttempt;
  rejectedWith: RecoveryRejection;
}

export interface RecoveredPasskey {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  deviceType: string;
  backedUp: boolean;
  name: string;
}

export interface RegisteredPasskey {
  id: string;
}

export interface RecoveryPasskeyAlert {
  userId: string;
  passkeyName: string;
  openedAt: Date;
}

export interface RecoveryRedemptionStore {
  findTokenByHash(tokenHash: string): Promise<RecoveryTokenRecord | undefined>;
  findAccount(userId: string): Promise<RecoveringAccount | undefined>;
  listRegisteredCredentials(userId: string): Promise<RegisteredCredential[]>;
  recordRegistrationChallenge(tokenId: string, challenge: string): Promise<void>;
  recordRejectedRedemption(rejection: RejectedRedemption): Promise<void>;
  transaction<TOutcome>(
    work: (tx: RecoveryRedemptionStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RecoveryRedemptionStoreTransaction {
  // Burns the token only while it is still redeemable at `at`: unused, not voided, not expired.
  burnToken(tokenId: string, at: Date): Promise<boolean>;
  // Raises `PasskeyAlreadyRegistered` when another passkey holds the credential.
  registerPasskey(passkey: RecoveredPasskey): Promise<RegisteredPasskey>;
  recordTokenRedeemed(tokenId: string, userId: string, at: Date): Promise<void>;
  recordPasskeyRegistered(
    userId: string,
    passkey: RegisteredPasskey,
    details: RecoveredPasskey,
  ): Promise<void>;
  openPasskeyRegisteredAlert(alert: RecoveryPasskeyAlert): Promise<void>;
  revokeSessions(userId: string, at: Date): Promise<void>;
}
