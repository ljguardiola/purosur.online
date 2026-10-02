import type { Passkeys } from "./passkeys.js";
import type { RegisteredCredential } from "./recovery-redemption-store.js";

export interface ListPasskeyCredentialsPorts {
  passkeys: Passkeys;
}

export interface ListPasskeyCredentialsInput {
  userId: string;
}

export function listPasskeyCredentials(
  { passkeys }: ListPasskeyCredentialsPorts,
  input: ListPasskeyCredentialsInput,
): Promise<RegisteredCredential[]> {
  return passkeys.registeredCredentials(input.userId);
}
