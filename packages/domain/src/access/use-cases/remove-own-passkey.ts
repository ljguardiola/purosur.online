import type { PasskeyRemovalStore } from "./passkey-removal-store.js";

export interface RemoveOwnPasskeyPorts {
  store: PasskeyRemovalStore;
}

export interface RemoveOwnPasskeyInput {
  userId: string;
  passkeyId: string;
  at: Date;
}

export type RemoveOwnPasskeyOutcome = { kind: "not_found" } | { kind: "removed" };

export function removeOwnPasskey(
  { store }: RemoveOwnPasskeyPorts,
  input: RemoveOwnPasskeyInput,
): Promise<RemoveOwnPasskeyOutcome> {
  return store.transaction<RemoveOwnPasskeyOutcome>(async (tx) => {
    const removed = await tx.deletePasskey(input.userId, input.passkeyId);
    if (!removed) {
      return { kind: "not_found" };
    }
    await tx.recordOwnPasskeyRemoved(input.userId, removed);
    await tx.openPasskeyRemovedAlert({
      userId: input.userId,
      passkeyName: removed.name,
      actorId: input.userId,
      via: "self",
      openedAt: input.at,
    });
    return { kind: "removed" };
  });
}
