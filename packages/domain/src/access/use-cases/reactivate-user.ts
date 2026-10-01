import type { UserStore } from "./user-store.js";

export interface ReactivateUserPorts {
  store: UserStore;
}

export interface ReactivateUserInput {
  id: string;
  actorId: string;
}

export type ReactivateUserOutcome = { kind: "not_found" } | { kind: "reactivated" };

export function reactivateUser(
  { store }: ReactivateUserPorts,
  input: ReactivateUserInput,
): Promise<ReactivateUserOutcome> {
  return store.transaction<ReactivateUserOutcome>(async (tx) => {
    // Reads `active` under the lock, so a second reactivation of the same user finds them active.
    const locked = await tx.lockUser(input.id);
    if (!locked || locked.active) {
      return { kind: "not_found" };
    }

    await tx.rewriteUser(input.id, {
      active: true,
      version: locked.version + 1,
      locationId: locked.locationId,
    });
    await tx.recordUserChange(input.id, input.actorId, { kind: "reactivated" });
    return { kind: "reactivated" };
  });
}
