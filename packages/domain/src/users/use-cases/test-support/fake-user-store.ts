import type { AssignableRole, RoleWithPermissions } from "../user-store.js";
import {
  type LockedUser,
  type NewUser,
  type StoredUserRevision,
  type UserAlert,
  type UserChange,
  UserEmailConflict,
  type UserRewrite,
  type UserStore,
  type UserStoreTransaction,
} from "../user-store.js";
import { type FakeBranchUser, FakeBranchUsers } from "./fake-branch-users.js";

export interface FakeUserRole extends AssignableRole {
  permissionKeys: string[];
}

interface RecordedUserChange {
  userId: string;
  actorId: string;
  change: UserChange;
}

export interface FakeUserStoreState {
  users: FakeBranchUser[];
  roles: FakeUserRole[];
  changes: RecordedUserChange[];
  alerts: UserAlert[];
  voidedRecoveryTokens: { userId: string; at: Date }[];
  revokedSessions: { userId: string; at: Date }[];
  createdUsers: number;
}

type WriteOperation =
  | "insertUser"
  | "assignRole"
  | "reassignRole"
  | "rewriteUser"
  | "voidOutstandingRecoveryTokens"
  | "revokeSessions"
  | "recordUserChange"
  | "openUserAlert";

class FakeUserStoreTransaction implements UserStoreTransaction {
  private readonly store: FakeUserStore;

  constructor(store: FakeUserStore) {
    this.store = store;
  }

  get users(): FakeBranchUsers {
    return this.store.users;
  }

  private get state(): FakeUserStoreState {
    return this.store.current;
  }

  async findRole(roleId: string): Promise<AssignableRole | undefined> {
    this.store.operationOrder.push("findRole");
    return this.roleNamed(roleId);
  }

  async roleOfUser(userId: string): Promise<AssignableRole | undefined> {
    this.store.operationOrder.push("roleOfUser");
    const holder = this.state.users.find((user) => user.id === userId);
    return holder && this.roleNamed(holder.roleId);
  }

  async lockAdministratorRole(): Promise<{ id: string } | undefined> {
    this.store.operationOrder.push("lockAdministratorRole");
    const role = this.state.roles.find((candidate) => candidate.isAdministrator);
    return role && { id: role.id };
  }

  async lockRoleForAssignment(roleId: string): Promise<RoleWithPermissions> {
    this.store.operationOrder.push(`lockRoleForAssignment:${roleId}`);
    const role = this.state.roles.find((candidate) => candidate.id === roleId);
    if (!role) {
      throw new Error("an assigned role no longer exists");
    }
    return {
      name: role.name,
      isAdministrator: role.isAdministrator,
      permissionKeys: [...role.permissionKeys],
    };
  }

  async lockUser(userId: string): Promise<LockedUser | undefined> {
    this.store.operationOrder.push("lockUser");
    return this.lockedUser(userId);
  }

  async lockUserForDeactivation(userId: string): Promise<LockedUser | undefined> {
    this.store.operationOrder.push("lockUserForDeactivation");
    return this.lockedUser(userId);
  }

  async activeAdministratorCount(locationId: string): Promise<number> {
    this.store.operationOrder.push("activeAdministratorCount");
    return this.users.activeAdministratorCount(locationId);
  }

  async insertUser(user: NewUser): Promise<StoredUserRevision> {
    this.beforeWrite("insertUser");
    this.guardEmail(user.email);
    this.state.createdUsers += 1;
    const created = { id: `new-user-${this.state.createdUsers}`, version: 1 };
    this.state.users.push({
      ...created,
      locationId: user.locationId,
      firstName: user.firstName,
      email: user.email,
      active: true,
      roleId: "",
      roleName: null,
      roleIsAdministrator: false,
      passkeyCount: 0,
    });
    return created;
  }

  async assignRole(userId: string, roleId: string): Promise<void> {
    this.beforeWrite("assignRole");
    this.setRole(userId, roleId);
  }

  async reassignRole(userId: string, roleId: string): Promise<void> {
    this.beforeWrite("reassignRole");
    this.setRole(userId, roleId);
  }

  async rewriteUser(userId: string, rewrite: UserRewrite): Promise<void> {
    this.beforeWrite("rewriteUser");
    const user = this.requireUser(userId);
    if (rewrite.email !== undefined) {
      this.guardEmail(rewrite.email, userId);
      user.email = rewrite.email;
    }
    if (rewrite.active !== undefined) {
      user.active = rewrite.active;
    }
    user.version = rewrite.version;
  }

  async voidOutstandingRecoveryTokens(userId: string, at: Date): Promise<void> {
    this.beforeWrite("voidOutstandingRecoveryTokens");
    this.state.voidedRecoveryTokens.push({ userId, at });
  }

  async revokeSessions(userId: string, at: Date): Promise<void> {
    this.beforeWrite("revokeSessions");
    this.state.revokedSessions.push({ userId, at });
  }

  async recordUserChange(userId: string, actorId: string, change: UserChange): Promise<void> {
    this.beforeWrite("recordUserChange");
    this.state.changes.push({ userId, actorId, change });
  }

  async openUserAlert(alert: UserAlert): Promise<void> {
    this.beforeWrite("openUserAlert");
    this.state.alerts.push(structuredClone(alert));
  }

  private roleNamed(roleId: string): AssignableRole | undefined {
    const role = this.state.roles.find((candidate) => candidate.id === roleId);
    return role && { id: role.id, name: role.name, isAdministrator: role.isAdministrator };
  }

  private lockedUser(userId: string): LockedUser | undefined {
    const user = this.state.users.find((candidate) => candidate.id === userId);
    return (
      user && {
        email: user.email,
        version: user.version,
        active: user.active,
        locationId: user.locationId,
      }
    );
  }

  private requireUser(userId: string): FakeBranchUser {
    const user = this.state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new Error("writing a user that does not exist");
    }
    return user;
  }

  private setRole(userId: string, roleId: string): void {
    const role = this.state.roles.find((candidate) => candidate.id === roleId);
    if (!role) {
      throw new Error("assigning a role that does not exist");
    }
    Object.assign(this.requireUser(userId), {
      roleId: role.id,
      roleName: role.name,
      roleIsAdministrator: role.isAdministrator,
    });
  }

  private guardEmail(email: string, exceptUserId?: string): void {
    if (this.emailHeldByAnother(email, exceptUserId)) {
      throw new UserEmailConflict();
    }
  }

  private emailHeldByAnother(email: string, exceptUserId?: string): boolean {
    return (
      this.store.racedEmails.has(email) ||
      this.state.users.some((user) => user.id !== exceptUserId && user.email === email)
    );
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeUserStore implements UserStore {
  private state: FakeUserStoreState = {
    users: [],
    roles: [],
    changes: [],
    alerts: [],
    voidedRecoveryTokens: [],
    revokedSessions: [],
    createdUsers: 0,
  };

  readonly users = new FakeBranchUsers(() => this.state.users);
  failingWrites = new Set<WriteOperation>();
  racedEmails = new Set<string>();
  operationOrder: string[] = [];

  get current(): FakeUserStoreState {
    return this.state;
  }

  seedRole(role: FakeUserRole): void {
    this.state.roles.push(structuredClone(role));
  }

  seedUser(user: FakeBranchUser): void {
    this.state.users.push(structuredClone(user));
  }

  snapshot(): FakeUserStoreState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: UserStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeUserStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
