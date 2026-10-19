import type { PinResetStore, PinResetStoreTransaction } from "./pin-reset-store.js";

export interface RequirePinResetOfEveryUserPorts {
  store: PinResetStore;
}

export interface RequirePinResetOfEveryUserInput {
  actorId: string;
}

export type RequirePinResetOfEveryUserOutcome = { kind: "required"; users: number };

export async function requirePinResetOfEveryUser(
  { store }: RequirePinResetOfEveryUserPorts,
  input: RequirePinResetOfEveryUserInput,
): Promise<RequirePinResetOfEveryUserOutcome> {
  return store.transaction((tx) => requirePinResetOfEveryUserWithin(tx, input));
}

export async function requirePinResetOfEveryUserWithin(
  tx: PinResetStoreTransaction,
  { actorId }: RequirePinResetOfEveryUserInput,
): Promise<RequirePinResetOfEveryUserOutcome> {
  const users = await tx.requirePinResetOfEveryUser(actorId);
  return { kind: "required", users };
}
