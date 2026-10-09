import type { SignInPasskey } from "../accounts.js";
import type { PasskeySummary, Passkeys } from "../passkeys.js";
import type { RegisteredCredential } from "../recovery-redemption-store.js";

export interface FakePasskey extends PasskeySummary {
  userId: string;
}

export class FakePasskeys implements Passkeys {
  private readonly stored: FakePasskey[] = [];
  private readonly storedPasskeys: SignInPasskey[] = [];
  private readonly credentials: { userId: string; credential: RegisteredCredential }[] = [];

  seedCredential(userId: string, credential: RegisteredCredential): void {
    this.credentials.push({ userId, credential });
  }

  async registeredCredentials(userId: string): Promise<RegisteredCredential[]> {
    return this.credentials.filter((held) => held.userId === userId).map((held) => held.credential);
  }

  seedStoredPasskey(passkey: SignInPasskey): void {
    this.storedPasskeys.push(passkey);
  }

  async passkeyByCredentialId(
    userId: string,
    credentialId: string,
  ): Promise<SignInPasskey | undefined> {
    return this.storedPasskeys.find(
      (held) => held.userId === userId && held.credentialId === credentialId,
    );
  }

  seedPasskey(passkey: FakePasskey): void {
    this.stored.push(passkey);
  }

  async passkeySummaries(userId: string): Promise<PasskeySummary[]> {
    return this.stored
      .filter((passkey) => passkey.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(({ userId: _userId, ...summary }) => summary);
  }
}
