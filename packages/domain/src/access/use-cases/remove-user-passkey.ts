import { hasValidPasskeyAuthorization } from "../model/passkey-authorization-window.js";
import type { PasskeyRemovalStore } from "./passkey-removal-store.js";

export interface RemoveUserPasskeyPorts {
  store: PasskeyRemovalStore;
}

export interface RemoveUserPasskeyInput {
  administratorId: string;
  targetUserId: string;
  passkeyId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
}

export type RemoveUserPasskeyOutcome =
  | { kind: "passkey_not_found" }
  | { kind: "authorization_required" }
  | { kind: "removed" };

export function removeUserPasskey(
  { store }: RemoveUserPasskeyPorts,
  input: RemoveUserPasskeyInput,
): Promise<RemoveUserPasskeyOutcome> {
  if (!hasValidPasskeyAuthorization({ passkeyAuthorizedAt: input.passkeyAuthorizedAt }, input.at)) {
    return Promise.resolve({ kind: "authorization_required" });
  }
  return store.transaction<RemoveUserPasskeyOutcome>(async (tx) => {
    const removable = await tx.findRemovablePasskey(input.targetUserId, input.passkeyId);
    if (!removable) {
      return { kind: "passkey_not_found" };
    }
    await tx.deletePasskey(removable.id);
    // A session open on a lost device must not outlive its removed passkey.
    await tx.revokeSessions(input.targetUserId, input.at);
    await tx.recordUserPasskeyRemoved(input.administratorId, input.targetUserId, removable);
    await tx.openPasskeyRemovedAlert({
      userId: input.targetUserId,
      passkeyName: removable.name,
      actorId: input.administratorId,
      via: "administrator",
      openedAt: input.at,
    });
    return { kind: "removed" };
  });
}
