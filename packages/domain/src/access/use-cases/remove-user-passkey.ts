import type { PasskeyRemovalStore } from "./passkey-removal-store.js";

export interface RemoveUserPasskeyPorts {
  store: PasskeyRemovalStore;
}

export interface RemoveUserPasskeyInput {
  administratorId: string;
  targetUserId: string;
  passkeyId: string;
  at: Date;
}

export type RemoveUserPasskeyOutcome = { kind: "not_found" } | { kind: "removed" };

export function removeUserPasskey(
  { store }: RemoveUserPasskeyPorts,
  input: RemoveUserPasskeyInput,
): Promise<RemoveUserPasskeyOutcome> {
  return store.transaction<RemoveUserPasskeyOutcome>(async (tx) => {
    const removed = await tx.deletePasskey(input.targetUserId, input.passkeyId);
    if (!removed) {
      return { kind: "not_found" };
    }
    // A session open on a lost device must not outlive its removed passkey.
    await tx.revokeSessions(input.targetUserId, input.at);
    await tx.recordUserPasskeyRemoved(input.administratorId, input.targetUserId, removed);
    await tx.openPasskeyRemovedAlert({
      userId: input.targetUserId,
      passkeyName: removed.name,
      actorId: input.administratorId,
      via: "administrator",
      openedAt: input.at,
    });
    return { kind: "removed" };
  });
}
