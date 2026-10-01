import { isReactivationOffered } from "../model/email-holder-disclosure.js";
import type { BranchUsers } from "./branch-users.js";
import { findEmailHolder } from "./find-email-holder.js";
import type { Clock } from "./pin-code-store.js";
import { UserEmailConflict, type UserStore } from "./user-store.js";

export interface CreateUserPorts {
  store: UserStore;
  users: BranchUsers;
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

export interface CreatedUserRole {
  id: string;
  name: string | null;
  isAdministrator: boolean;
}

export type CreateUserOutcome =
  | { kind: "unknown_role" }
  | { kind: "email_taken" }
  | { kind: "email_belongs_to_deactivated_user"; id: string; firstName: string }
  | { kind: "created"; id: string; role: CreatedUserRole };

export async function createUser(
  { store, users, clock }: CreateUserPorts,
  input: CreateUserInput,
): Promise<CreateUserOutcome> {
  try {
    return await store.transaction<CreateUserOutcome>(async (tx) => {
      const role = await tx.findRole(input.roleId);
      if (!role) {
        return { kind: "unknown_role" };
      }

      const { id } = await tx.insertUser({
        firstName: input.firstName,
        email: input.email,
        locationId: input.locationId,
      });
      await tx.assignRole(id, role.id);
      await tx.recordUserChange(id, input.actorId, {
        kind: "created",
        firstName: input.firstName,
        email: input.email,
        roleId: role.id,
      });
      if (role.isAdministrator) {
        await tx.openUserAlert({
          kind: "created_as_administrator",
          userId: id,
          actorId: input.actorId,
          openedAt: clock.now(),
        });
      }

      return { kind: "created", id, role };
    });
  } catch (error) {
    if (!(error instanceof UserEmailConflict)) {
      throw error;
    }
  }

  const holder = await findEmailHolder({ users }, { email: input.email });
  if (
    holder &&
    isReactivationOffered(holder, {
      locationId: input.locationId,
      mayReactivateUsers: input.actorMayReactivateUsers,
    })
  ) {
    return {
      kind: "email_belongs_to_deactivated_user",
      id: holder.id,
      firstName: holder.firstName,
    };
  }
  return { kind: "email_taken" };
}
