import { mayRemovePasskeyOf } from "../../users/index.js";
import { hasValidPasskeyAuthorization } from "../model/passkey-authorization-window.js";
import type { PasskeyHolders } from "./passkey-holders.js";
import type {
  PasskeyRemovalStore,
  PasskeyRemovalStoreTransaction,
} from "./passkey-removal-store.js";

export interface RemoveEveryUserPasskeyPorts {
  store: PasskeyRemovalStore;
  holders: PasskeyHolders;
}

export interface RemoveEveryUserPasskeyInput {
  locationId: string;
  administratorId: string;
  targetUserId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
}

export type RemoveEveryUserPasskeyOutcome =
  | { kind: "authorization_required" }
  | { kind: "user_not_found" }
  | { kind: "own_account" }
  | { kind: "no_passkeys" }
  | { kind: "removed" };

type RemovalRefusal = Extract<
  RemoveEveryUserPasskeyOutcome,
  { kind: "authorization_required" | "user_not_found" | "own_account" }
>;

async function removalRefusalOrTarget(
  holders: PasskeyHolders,
  input: RemoveEveryUserPasskeyInput,
): Promise<RemovalRefusal | { kind: "target"; id: string }> {
  if (!hasValidPasskeyAuthorization({ passkeyAuthorizedAt: input.passkeyAuthorizedAt }, input.at)) {
    return { kind: "authorization_required" };
  }
  const target = await holders.passkeyHolder(input.locationId, input.targetUserId, "active");
  if (!target) {
    return { kind: "user_not_found" };
  }
  if (!mayRemovePasskeyOf(input.administratorId, target)) {
    return { kind: "own_account" };
  }
  return { kind: "target", id: target.id };
}

async function removeEveryPasskeyOfTarget(
  tx: PasskeyRemovalStoreTransaction,
  targetId: string,
  input: RemoveEveryUserPasskeyInput,
): Promise<RemoveEveryUserPasskeyOutcome> {
  const removable = await tx.lockUserPasskeys(targetId);
  if (removable.length === 0) {
    return { kind: "no_passkeys" };
  }
  for (const passkey of removable) {
    await tx.deletePasskey(passkey.id);
  }
  await tx.revokeSessions(targetId, input.at);
  for (const passkey of removable) {
    await tx.recordUserPasskeyRemoved(input.administratorId, targetId, passkey);
    await tx.openPasskeyRemovedAlert({
      userId: targetId,
      passkeyName: passkey.name,
      actorId: input.administratorId,
      via: "administrator",
      openedAt: input.at,
    });
  }
  return { kind: "removed" };
}

export async function removeEveryUserPasskey(
  { store, holders }: RemoveEveryUserPasskeyPorts,
  input: RemoveEveryUserPasskeyInput,
): Promise<RemoveEveryUserPasskeyOutcome> {
  const target = await removalRefusalOrTarget(holders, input);
  if (target.kind !== "target") {
    return target;
  }
  return store.transaction<RemoveEveryUserPasskeyOutcome>((tx) =>
    removeEveryPasskeyOfTarget(tx, target.id, input),
  );
}

export async function removeEveryUserPasskeyWithin(
  tx: PasskeyRemovalStoreTransaction,
  holders: PasskeyHolders,
  input: RemoveEveryUserPasskeyInput,
): Promise<RemoveEveryUserPasskeyOutcome> {
  const target = await removalRefusalOrTarget(holders, input);
  if (target.kind !== "target") {
    return target;
  }
  return removeEveryPasskeyOfTarget(tx, target.id, input);
}
