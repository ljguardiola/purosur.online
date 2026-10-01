import type { RoleDirectory, RoleHolder, RoleListing, StoredRole } from "../role-directory.js";

export interface FakeRole extends StoredRole {
  holders: (RoleHolder & { active: boolean })[];
}

export class FakeRoleDirectory implements RoleDirectory {
  private readonly seeded: FakeRole[] = [];

  seedRole(role: FakeRole): void {
    this.seeded.push(role);
  }

  async roles(): Promise<RoleListing[]> {
    return this.seeded.map((role) => ({
      id: role.id,
      name: role.name,
      isAdministrator: role.isAdministrator,
      storedPermissionKeys: role.storedPermissionKeys,
      activeHolderCount: role.holders.filter((holder) => holder.active).length,
    }));
  }

  async role(roleId: string): Promise<StoredRole | undefined> {
    const found = this.seeded.find((role) => role.id === roleId);
    return (
      found && {
        id: found.id,
        name: found.name,
        isAdministrator: found.isAdministrator,
        version: found.version,
        storedPermissionKeys: found.storedPermissionKeys,
      }
    );
  }

  async activeRoleHolders(roleId: string): Promise<RoleHolder[]> {
    const role = this.seeded.find((candidate) => candidate.id === roleId);
    return (role?.holders ?? [])
      .filter((holder) => holder.active)
      .map(({ id, name }) => ({ id, name }));
  }
}
