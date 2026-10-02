export interface AccountProfile {
  firstName: string;
  email: string;
}

export interface SignInPasskey {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
}

export interface StoredSignInPasskey extends SignInPasskey {
  userActive: boolean;
}

export interface Accounts {
  profile(userId: string): Promise<AccountProfile | undefined>;
  signInPasskey(credentialId: string): Promise<StoredSignInPasskey | undefined>;
}
