import type { RecoveredPasskey, RegisteredPasskey } from "./recovery-redemption-store.js";

export interface AddedPasskey extends RegisteredPasskey {
  createdAt: Date;
}

export interface PasskeyRegistrationAlert {
  userId: string;
  passkeyName: string;
  openedAt: Date;
}

export interface PasskeyRegistrationStore {
  transaction<TOutcome>(
    work: (tx: PasskeyRegistrationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PasskeyRegistrationStoreTransaction {
  // Raises `PasskeyAlreadyRegistered` when another passkey holds the credential.
  addPasskey(passkey: RecoveredPasskey): Promise<AddedPasskey>;
  recordPasskeyRegistered(
    userId: string,
    passkey: RegisteredPasskey,
    details: RecoveredPasskey,
  ): Promise<void>;
  openPasskeyRegisteredAlert(alert: PasskeyRegistrationAlert): Promise<void>;
}
