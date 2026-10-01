import type { RoleSummary } from "./list-roles.js";
import { RoleNameConflict, type RoleStore } from "./role-store.js";

export interface CreateRolePorts {
  store: RoleStore;
}

export interface CreateRoleInput {
  name: string;
  permissionKeys: string[];
  actorId: string;
}

export type CreateRoleOutcome = { kind: "name_taken" } | { kind: "created"; role: RoleSummary };

export async function createRole(
  { store }: CreateRolePorts,
  input: CreateRoleInput,
): Promise<CreateRoleOutcome> {
  try {
    return await store.transaction<CreateRoleOutcome>(async (tx) => {
      if (await tx.roleNameTaken(input.name)) {
        return { kind: "name_taken" };
      }

      const { id } = await tx.insertRole({
        name: input.name,
        permissionKeys: input.permissionKeys,
      });
      await tx.recordRoleChange({
        roleId: id,
        actorId: input.actorId,
        previous: null,
        next: { name: input.name, permissionKeys: input.permissionKeys },
      });

      return {
        kind: "created",
        role: {
          id,
          name: input.name,
          isAdministrator: false,
          permissionKeys: input.permissionKeys,
          userCount: 0,
        },
      };
    });
  } catch (error) {
    if (!(error instanceof RoleNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
