import type { RoleHolder } from "./role-directory.js";

export class RoleNameConflict extends Error {}

export interface RoleSnapshot {
  name: string | null;
  permissionKeys: string[];
}

export interface NewRole {
  name: string;
  permissionKeys: string[];
}

export interface StoredRoleRevision {
  id: string;
  version: number;
}

export interface RoleRewrite {
  name: string;
  version: number;
  permissionKeys: string[];
}

export interface LockedRole {
  name: string | null;
  isAdministrator: boolean;
  version: number;
}

export type LockRoleResult = { kind: "not_found" } | { kind: "locked"; role: LockedRole };

export interface RoleChange {
  roleId: string;
  actorId: string;
  previous: RoleSnapshot | null;
  next: RoleSnapshot;
}

export interface RoleAccessIncrease {
  holderId: string;
  roleName: string;
  addedPermissionKeys: string[];
  actorId: string;
  openedAt: Date;
}

export interface RoleStore {
  transaction<TOutcome>(work: (tx: RoleStoreTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface RoleStoreTransaction {
  lockRole(roleId: string): Promise<LockRoleResult>;
  roleNameTaken(name: string, excludingRoleId?: string): Promise<boolean>;
  storedPermissionKeys(roleId: string): Promise<string[]>;
  insertRole(role: NewRole): Promise<StoredRoleRevision>;
  rewriteRole(roleId: string, rewrite: RoleRewrite): Promise<void>;
  recordRoleChange(change: RoleChange): Promise<void>;
  activeRoleHolders(roleId: string): Promise<RoleHolder[]>;
  openAccessIncreasedAlert(increase: RoleAccessIncrease): Promise<void>;
}
