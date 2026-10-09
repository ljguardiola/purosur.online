import type { PasskeyHolderScope, PasskeyHolders } from "./passkey-holders.js";
import type { PasskeySummary, Passkeys } from "./passkeys.js";

export interface ListUserPasskeysPorts {
  holders: PasskeyHolders;
  passkeys: Passkeys;
}

export interface ListUserPasskeysInput {
  locationId: string;
  userId: string;
  activeScope: PasskeyHolderScope;
}

export type ListUserPasskeysOutcome =
  | { kind: "not_found" }
  | { kind: "listed"; passkeys: PasskeySummary[] };

export async function listUserPasskeys(
  { holders, passkeys }: ListUserPasskeysPorts,
  input: ListUserPasskeysInput,
): Promise<ListUserPasskeysOutcome> {
  const user = await holders.passkeyHolder(input.locationId, input.userId, input.activeScope);
  if (!user) {
    return { kind: "not_found" };
  }
  return { kind: "listed", passkeys: await passkeys.passkeySummaries(user.id) };
}
