import type { PinResetStore } from "./pin-reset-store.js";

export interface RequirePinResetOfEveryUserPorts {
  store: PinResetStore;
}

export interface RequirePinResetOfEveryUserInput {
  actorId: string;
}

export type RequirePinResetOfEveryUserOutcome = { kind: "required"; users: number };

export async function requirePinResetOfEveryUser(
  { store }: RequirePinResetOfEveryUserPorts,
  { actorId }: RequirePinResetOfEveryUserInput,
): Promise<RequirePinResetOfEveryUserOutcome> {
  const users = await store.transaction((tx) => tx.requirePinResetOfEveryUser(actorId));
  return { kind: "required", users };
}
