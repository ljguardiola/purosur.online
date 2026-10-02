import { hasValidPasskeyAuthorization } from "../model/passkey-authorization-window.js";
import type { BranchUsers } from "./branch-users.js";
import { findBranchUser } from "./find-branch-user.js";
import type { PasskeyRemovalStore } from "./passkey-removal-store.js";

export interface RemoveUserPasskeyPorts {
  users: BranchUsers;
  store: PasskeyRemovalStore;
}

export interface RemoveUserPasskeyInput {
  locationId: string;
  administratorId: string;
  targetUserId: string;
  passkeyId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
}

export type RemoveUserPasskeyOutcome =
  | { kind: "user_not_found" }
  | { kind: "own_account" }
  | { kind: "passkey_not_found" }
  | { kind: "authorization_required" }
  | { kind: "removed" };

export async function removeUserPasskey(
  { users, store }: RemoveUserPasskeyPorts,
  input: RemoveUserPasskeyInput,
): Promise<RemoveUserPasskeyOutcome> {
  const target = await findBranchUser(
    { users },
    { locationId: input.locationId, userId: input.targetUserId },
  );
  if (!target) {
    return { kind: "user_not_found" };
  }
  if (target.id === input.administratorId) {
    return { kind: "own_account" };
  }
  return store.transaction<RemoveUserPasskeyOutcome>(async (tx) => {
    const removable = await tx.findRemovablePasskey(target.id, input.passkeyId);
    if (!removable) {
      return { kind: "passkey_not_found" };
    }
    if (
      !hasValidPasskeyAuthorization({ passkeyAuthorizedAt: input.passkeyAuthorizedAt }, input.at)
    ) {
      return { kind: "authorization_required" };
    }
    await tx.deletePasskey(removable.id);
    // A session open on a lost device must not outlive its removed passkey.
    await tx.revokeSessions(target.id, input.at);
    await tx.recordUserPasskeyRemoved(input.administratorId, target.id, removable);
    await tx.openPasskeyRemovedAlert({
      userId: target.id,
      passkeyName: removable.name,
      actorId: input.administratorId,
      via: "administrator",
      openedAt: input.at,
    });
    return { kind: "removed" };
  });
}
