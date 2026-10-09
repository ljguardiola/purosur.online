import type { AccountProfile, Accounts, StoredSignInPasskey } from "../accounts.js";

export interface FakeAccount extends AccountProfile {
  id: string;
}

export class FakeAccounts implements Accounts {
  private readonly accounts = new Map<string, AccountProfile>();
  private readonly passkeys = new Map<string, StoredSignInPasskey>();

  seedAccount({ id, ...profile }: FakeAccount): void {
    this.accounts.set(id, profile);
  }

  seedPasskey(passkey: StoredSignInPasskey): void {
    this.passkeys.set(passkey.credentialId, passkey);
  }

  async profile(userId: string): Promise<AccountProfile | undefined> {
    return this.accounts.get(userId);
  }

  async signInPasskey(credentialId: string): Promise<StoredSignInPasskey | undefined> {
    return this.passkeys.get(credentialId);
  }
}
