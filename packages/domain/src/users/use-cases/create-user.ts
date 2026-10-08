import type { Clock } from "../../shared/index.js";
import { isLastActiveAdministrator } from "../model/last-active-administrator.js";
import type { BranchUser } from "./branch-users.js";
import { type StoredUserRevision, UserEmailConflict, type UserStore } from "./user-store.js";

export interface CreateUserPorts {
  store: UserStore;
  clock: Clock;
}

export interface CreateUserInput {
  firstName: string;
  email: string;
  roleId: string;
  locationId: string;
  actorId: string;
  actorMayReactivateUsers: boolean;
}

export type CreateUserOutcome =
  | { kind: "unknown_role" }
  | { kind: "email_taken" }
  | { kind: "email_belongs_to_deactivated_user"; id: string; firstName: string }
  | { kind: "created"; user: BranchUser };

export function createUser(
  { store, clock }: CreateUserPorts,
  input: CreateUserInput,
): Promise<CreateUserOutcome> {
  return store.transaction<CreateUserOutcome>(async (tx) => {
    const role = await tx.findRole(input.roleId);
    if (!role) {
      return { kind: "unknown_role" };
    }

    let inserted: StoredUserRevision;
    try {
      inserted = await tx.insertUser({
        firstName: input.firstName,
        email: input.email,
        locationId: input.locationId,
      });
    } catch (error) {
      if (!(error instanceof UserEmailConflict)) {
        throw error;
      }
      if (!input.actorMayReactivateUsers) {
        return { kind: "email_taken" };
      }
      const holder = await tx.users.branchUserWithEmail(input.locationId, input.email, "inactive");
      if (holder) {
        return {
          kind: "email_belongs_to_deactivated_user",
          id: holder.id,
          firstName: holder.firstName,
        };
      }
      return { kind: "email_taken" };
    }

    await tx.assignRole(inserted.id, role.id);
    await tx.recordUserChange(inserted.id, input.actorId, {
      kind: "created",
      firstName: input.firstName,
      email: input.email,
      roleId: role.id,
    });
    if (role.isAdministrator) {
      await tx.openUserAlert({
        kind: "created_as_administrator",
        userId: inserted.id,
        actorId: input.actorId,
        openedAt: clock.now(),
      });
    }

    const activeAdministratorCount = await tx.activeAdministratorCount(input.locationId);
    return {
      kind: "created",
      user: {
        id: inserted.id,
        firstName: input.firstName,
        email: input.email,
        version: inserted.version,
        active: true,
        roleId: role.id,
        roleName: role.name,
        roleIsAdministrator: role.isAdministrator,
        passkeyCount: 0,
        isLastActiveAdministrator: isLastActiveAdministrator(
          { holdsAdministratorRole: role.isAdministrator },
          activeAdministratorCount,
        ),
      },
    };
  });
}
