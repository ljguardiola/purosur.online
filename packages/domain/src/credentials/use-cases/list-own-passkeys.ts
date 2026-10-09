import type { PasskeySummary, Passkeys } from "./passkeys.js";

export interface ListOwnPasskeysPorts {
  passkeys: Passkeys;
}

export interface ListOwnPasskeysInput {
  userId: string;
}

export function listOwnPasskeys(
  { passkeys }: ListOwnPasskeysPorts,
  input: ListOwnPasskeysInput,
): Promise<PasskeySummary[]> {
  return passkeys.passkeySummaries(input.userId);
}
