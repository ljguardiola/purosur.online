import type { SignInPasskey } from "./accounts.js";
import type { RegisteredCredential } from "./recovery-redemption-store.js";

export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface Passkeys {
  // Ordered by creation.
  passkeySummaries(userId: string): Promise<PasskeySummary[]>;
  registeredCredentials(userId: string): Promise<RegisteredCredential[]>;
  // Scoped to the user, so another account's passkey with the same credential id is never found.
  passkeyByCredentialId(userId: string, credentialId: string): Promise<SignInPasskey | undefined>;
}
