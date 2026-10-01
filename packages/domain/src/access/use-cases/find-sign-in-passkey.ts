import type { Accounts, SignInPasskey } from "./accounts.js";

export interface FindSignInPasskeyPorts {
  accounts: Accounts;
}

export interface FindSignInPasskeyInput {
  credentialId: string;
}

export type FindSignInPasskeyOutcome =
  | { kind: "unknown" }
  | { kind: "inactive" }
  | { kind: "found"; passkey: SignInPasskey };

export async function findSignInPasskey(
  { accounts }: FindSignInPasskeyPorts,
  input: FindSignInPasskeyInput,
): Promise<FindSignInPasskeyOutcome> {
  const stored = await accounts.signInPasskey(input.credentialId);
  if (!stored) {
    return { kind: "unknown" };
  }
  const { userActive, ...passkey } = stored;
  if (!userActive) {
    return { kind: "inactive" };
  }
  return { kind: "found", passkey };
}
