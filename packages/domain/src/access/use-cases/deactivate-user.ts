import { isUserDeactivatable } from "../model/user-deactivation.js";
import type { UserStore } from "./user-store.js";

export interface DeactivateUserPorts {
  store: UserStore;
}

export interface DeactivateUserInput {
  id: string;
  actorId: string;
  at: Date;
}

export type DeactivateUserOutcome = { kind: "not_found" } | { kind: "deactivated" };

export function deactivateUser(
  { store }: DeactivateUserPorts,
  input: DeactivateUserInput,
): Promise<DeactivateUserOutcome> {
  return store.transaction<DeactivateUserOutcome>(async (tx) => {
    const locked = await tx.lockUserForDeactivation(input.id);
    if (!locked?.active) {
      return { kind: "not_found" };
    }
    const role = await tx.roleOfUser(input.id);
    if (
      !role ||
      !isUserDeactivatable(
        { id: input.id, holdsAdministratorRole: role.isAdministrator },
        input.actorId,
      )
    ) {
      return { kind: "not_found" };
    }

    await tx.rewriteUser(input.id, {
      active: false,
      version: locked.version + 1,
      locationId: locked.locationId,
    });
    await tx.revokeSessions(input.id, input.at);
    await tx.recordUserChange(input.id, input.actorId, { kind: "deactivated" });
    return { kind: "deactivated" };
  });
}
