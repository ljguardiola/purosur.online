import { increasesAccess } from "../model/access-increase.js";
import { isLastActiveAdministrator } from "../model/last-active-administrator.js";
import type { BranchUser } from "./branch-users.js";
import { findBranchUser } from "./find-branch-user.js";
import type { Clock } from "./pin-code-store.js";
import { UserEmailConflict, type UserStore } from "./user-store.js";

export interface EditUserPorts {
  store: UserStore;
  clock: Clock;
}

export interface EditUserInput {
  id: string;
  locationId: string;
  email: string;
  roleId: string;
  version: number;
  actorId: string;
}

export type EditUserOutcome =
  | { kind: "unknown_role" }
  | { kind: "stale_version" }
  | { kind: "email_taken" }
  | { kind: "last_administrator" }
  | { kind: "applied"; user: BranchUser };

export async function editUser(
  { store, clock }: EditUserPorts,
  input: EditUserInput,
): Promise<EditUserOutcome> {
  try {
    return await store.transaction<EditUserOutcome>(async (tx) => {
      const requestedRole = await tx.findRole(input.roleId);
      if (!requestedRole) {
        return { kind: "unknown_role" };
      }

      const administratorRole = await tx.lockAdministratorRole();
      if (!administratorRole) {
        return { kind: "stale_version" };
      }

      const currentRole = await tx.roleOfUser(input.id);
      if (!currentRole) {
        return { kind: "stale_version" };
      }

      const roleChanged = currentRole.id !== requestedRole.id;
      const roleAccessChange = roleChanged
        ? {
            previousRole: await tx.lockRoleForAssignment(currentRole.id),
            newRole: await tx.lockRoleForAssignment(requestedRole.id),
          }
        : undefined;

      const locked = await tx.lockUser(input.id);
      if (!locked || locked.version !== input.version) {
        return { kind: "stale_version" };
      }

      const activeAdministratorCount = await tx.activeAdministratorCount(input.locationId);
      if (
        isLastActiveAdministrator(
          { holdsAdministratorRole: currentRole.id === administratorRole.id },
          activeAdministratorCount,
        ) &&
        requestedRole.id !== administratorRole.id
      ) {
        return { kind: "last_administrator" };
      }

      const emailChanged = locked.email !== input.email;
      if (emailChanged || roleChanged) {
        await tx.rewriteUser(input.id, {
          version: locked.version + 1,
          locationId: locked.locationId,
          ...(emailChanged ? { email: input.email } : {}),
        });
      }

      if (emailChanged) {
        // A recovery link already sent to the previous address must not outlive the change.
        await tx.voidOutstandingRecoveryTokens(input.id, clock.now());
        await tx.recordUserChange(input.id, input.actorId, {
          kind: "email_changed",
          previousEmail: locked.email,
          email: input.email,
        });
        await tx.openUserAlert({
          kind: "email_changed",
          userId: input.id,
          previousEmail: locked.email,
          newEmail: input.email,
          actorId: input.actorId,
          openedAt: clock.now(),
        });
      }

      if (roleAccessChange) {
        const { previousRole, newRole } = roleAccessChange;
        await tx.reassignRole(input.id, requestedRole.id);
        await tx.recordUserChange(input.id, input.actorId, {
          kind: "role_changed",
          previousRoleId: currentRole.id,
          roleId: requestedRole.id,
        });
        if (increasesAccess(previousRole, newRole)) {
          await tx.openUserAlert({
            kind: "role_assigned",
            userId: input.id,
            previousRole: {
              name: previousRole.name,
              isAdministrator: previousRole.isAdministrator,
            },
            newRole: { name: newRole.name, isAdministrator: newRole.isAdministrator },
            actorId: input.actorId,
            openedAt: clock.now(),
          });
        }
      }

      const edited = await findBranchUser(
        { users: tx.users },
        { locationId: input.locationId, userId: input.id },
      );
      if (!edited) {
        throw new Error("edited user is no longer an active user of this branch");
      }
      return { kind: "applied", user: edited };
    });
  } catch (error) {
    if (!(error instanceof UserEmailConflict)) {
      throw error;
    }
    return { kind: "email_taken" };
  }
}
