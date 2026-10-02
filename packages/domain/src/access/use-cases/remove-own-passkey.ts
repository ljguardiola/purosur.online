import { hasValidPasskeyAuthorization } from "../model/passkey-authorization-window.js";
import type { PasskeyRemovalStore } from "./passkey-removal-store.js";

export interface RemoveOwnPasskeyPorts {
  store: PasskeyRemovalStore;
}

export interface RemoveOwnPasskeyInput {
  userId: string;
  passkeyId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
}

export type RemoveOwnPasskeyOutcome =
  | { kind: "not_found" }
  | { kind: "authorization_required" }
  | { kind: "removed" };

export function removeOwnPasskey(
  { store }: RemoveOwnPasskeyPorts,
  input: RemoveOwnPasskeyInput,
): Promise<RemoveOwnPasskeyOutcome> {
  return store.transaction<RemoveOwnPasskeyOutcome>(async (tx) => {
    const removable = await tx.findRemovablePasskey(input.userId, input.passkeyId);
    if (!removable) {
      return { kind: "not_found" };
    }
    if (
      !hasValidPasskeyAuthorization({ passkeyAuthorizedAt: input.passkeyAuthorizedAt }, input.at)
    ) {
      return { kind: "authorization_required" };
    }
    await tx.deletePasskey(removable.id);
    await tx.recordOwnPasskeyRemoved(input.userId, removable);
    await tx.openPasskeyRemovedAlert({
      userId: input.userId,
      passkeyName: removable.name,
      actorId: input.userId,
      via: "self",
      openedAt: input.at,
    });
    return { kind: "removed" };
  });
}
