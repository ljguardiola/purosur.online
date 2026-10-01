import type { BranchUsers } from "./branch-users.js";

export class UserEmailConflict extends Error {}

export interface AssignableRole {
  id: string;
  name: string | null;
  isAdministrator: boolean;
}

export interface RoleWithPermissions {
  name: string | null;
  isAdministrator: boolean;
  permissionKeys: string[];
}

export interface NewUser {
  firstName: string;
  email: string;
  locationId: string;
}

export interface StoredUserRevision {
  id: string;
  version: number;
}

export interface LockedUser {
  email: string;
  version: number;
  active: boolean;
  locationId: string;
}

export interface UserRewrite {
  version: number;
  locationId: string;
  email?: string;
  active?: boolean;
}

export type UserChange =
  | { kind: "created"; firstName: string; email: string; roleId: string }
  | { kind: "email_changed"; previousEmail: string; email: string }
  | { kind: "role_changed"; previousRoleId: string; roleId: string }
  | { kind: "deactivated" }
  | { kind: "reactivated" };

export type UserAlert =
  | { kind: "created_as_administrator"; userId: string; actorId: string; openedAt: Date }
  | {
      kind: "email_changed";
      userId: string;
      previousEmail: string;
      newEmail: string;
      actorId: string;
      openedAt: Date;
    }
  | {
      kind: "role_assigned";
      userId: string;
      previousRole: { name: string | null; isAdministrator: boolean };
      newRole: { name: string | null; isAdministrator: boolean };
      actorId: string;
      openedAt: Date;
    };

export interface UserStore {
  transaction<TOutcome>(work: (tx: UserStoreTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface UserStoreTransaction {
  // Reads through the transaction, so it sees what the transaction has written and holds.
  readonly users: BranchUsers;
  findRole(roleId: string): Promise<AssignableRole | undefined>;
  roleOfUser(userId: string): Promise<AssignableRole | undefined>;
  lockAdministratorRole(): Promise<{ id: string } | undefined>;
  // Shares the role's lock: an edit of the role's permissions waits for this assignment.
  lockRoleForAssignment(roleId: string): Promise<RoleWithPermissions>;
  lockUser(userId: string): Promise<LockedUser | undefined>;
  // Weaker than `lockUser`: it does not block the writes that only reference the user.
  lockUserForDeactivation(userId: string): Promise<LockedUser | undefined>;
  activeAdministratorCount(locationId: string): Promise<number>;
  // Inserts nothing and answers no revision when another user holds the email.
  insertUser(user: NewUser): Promise<StoredUserRevision | undefined>;
  assignRole(userId: string, roleId: string): Promise<void>;
  reassignRole(userId: string, roleId: string): Promise<void>;
  // Raises `UserEmailConflict` when another user holds the email.
  rewriteUser(userId: string, rewrite: UserRewrite): Promise<void>;
  voidOutstandingRecoveryTokens(userId: string, at: Date): Promise<void>;
  revokeSessions(userId: string, at: Date): Promise<void>;
  recordUserChange(userId: string, actorId: string, change: UserChange): Promise<void>;
  openUserAlert(alert: UserAlert): Promise<void>;
}
