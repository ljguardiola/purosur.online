import { hasValidPasskeyAuthorization } from "../model/passkey-authorization-window.js";
import { mayRemovePasskeyOf } from "../model/user-management.js";
import type { BranchUsers } from "./branch-users.js";
import { findBranchUser } from "./find-branch-user.js";
import type { PasskeyRemovalStore } from "./passkey-removal-store.js";

export interface RemoveUserPasskeyPorts {
  store: PasskeyRemovalStore;
  users: BranchUsers;
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
  | { kind: "passkey_not_found" }
  | { kind: "user_not_found" }
  | { kind: "own_account" }
  | { kind: "authorization_required" }
  | { kind: "removed" };

export async function removeUserPasskey(
  { store, users }: RemoveUserPasskeyPorts,
  input: RemoveUserPasskeyInput,
): Promise<RemoveUserPasskeyOutcome> {
  if (!hasValidPasskeyAuthorization({ passkeyAuthorizedAt: input.passkeyAuthorizedAt }, input.at)) {
    return { kind: "authorization_required" };
  }
  const target = await findBranchUser(
    { users },
    { locationId: input.locationId, userId: input.targetUserId },
  );
  if (!target) {
    return { kind: "user_not_found" };
  }
  if (!mayRemovePasskeyOf(input.administratorId, target)) {
    return { kind: "own_account" };
  }
  return store.transaction<RemoveUserPasskeyOutcome>(async (tx) => {
    const removable = await tx.findRemovablePasskey(target.id, input.passkeyId);
    if (!removable) {
      return { kind: "passkey_not_found" };
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
