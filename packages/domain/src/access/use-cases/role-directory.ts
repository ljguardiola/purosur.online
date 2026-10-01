export interface RoleListing {
  id: string;
  name: string | null;
  isAdministrator: boolean;
  storedPermissionKeys: string[];
  activeHolderCount: number;
}

export interface StoredRole {
  id: string;
  name: string | null;
  isAdministrator: boolean;
  version: number;
  storedPermissionKeys: string[];
}

export interface RoleHolder {
  id: string;
  name: string;
}

export interface RoleDirectory {
  // The Administrator role first, then by name.
  roles(): Promise<RoleListing[]>;
  // A malformed id is no role.
  role(roleId: string): Promise<StoredRole | undefined>;
  // Ordered by first name.
  activeRoleHolders(roleId: string): Promise<RoleHolder[]>;
}
