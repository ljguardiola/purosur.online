import type { RoleDirectory, RoleHolder, RoleListing, StoredRole } from "../role-directory.js";
import {
  type LockRoleResult,
  type NewRole,
  type RoleAccessIncrease,
  type RoleChange,
  RoleNameConflict,
  type RoleRewrite,
  type RoleStore,
  type RoleStoreTransaction,
  type StoredRoleRevision,
} from "../role-store.js";
import type { FakeRole } from "./fake-role-directory.js";

export interface FakeRoleStoreState {
  roles: FakeRole[];
  changes: RoleChange[];
  alerts: RoleAccessIncrease[];
  createdRoles: number;
}

type WriteOperation =
  | "insertRole"
  | "rewriteRole"
  | "recordRoleChange"
  | "openAccessIncreasedAlert";

const sameName = (left: string | null, right: string): boolean =>
  left !== null && left.toLowerCase() === right.toLowerCase();

class FakeRoleStoreTransaction implements RoleStoreTransaction {
  private readonly state: FakeRoleStoreState;
  private readonly store: FakeRoleStore;

  constructor(state: FakeRoleStoreState, store: FakeRoleStore) {
    this.state = state;
    this.store = store;
  }

  async lockRole(roleId: string): Promise<LockRoleResult> {
    this.store.operationOrder.push("lockRole");
    const role = this.state.roles.find((candidate) => candidate.id === roleId);
    return role
      ? {
          kind: "locked",
          role: { name: role.name, isAdministrator: role.isAdministrator, version: role.version },
        }
      : { kind: "not_found" };
  }

  async roleNameTaken(name: string, excludingRoleId?: string): Promise<boolean> {
    this.store.operationOrder.push("roleNameTaken");
    return this.state.roles.some(
      (role) => role.id !== excludingRoleId && sameName(role.name, name),
    );
  }

  async storedPermissionKeys(roleId: string): Promise<string[]> {
    this.store.operationOrder.push("storedPermissionKeys");
    return [...(this.state.roles.find((role) => role.id === roleId)?.storedPermissionKeys ?? [])];
  }

  async insertRole(role: NewRole): Promise<StoredRoleRevision> {
    this.beforeWrite("insertRole", role.name);
    this.state.createdRoles += 1;
    const created = { id: `new-role-${this.state.createdRoles}`, version: 1 };
    this.state.roles.push({
      ...created,
      name: role.name,
      isAdministrator: false,
      storedPermissionKeys: [...role.permissionKeys],
      holders: [],
    });
    return created;
  }

  async rewriteRole(roleId: string, rewrite: RoleRewrite): Promise<void> {
    this.beforeWrite("rewriteRole", rewrite.name);
    const role = this.state.roles.find((candidate) => candidate.id === roleId);
    if (!role) {
      throw new Error("rewriting a role that does not exist");
    }
    role.name = rewrite.name;
    role.version = rewrite.version;
    role.storedPermissionKeys = [...rewrite.permissionKeys];
  }

  async recordRoleChange(change: RoleChange): Promise<void> {
    this.beforeWrite("recordRoleChange");
    this.state.changes.push(structuredClone(change));
  }

  async activeRoleHolders(roleId: string): Promise<RoleHolder[]> {
    this.store.operationOrder.push("activeRoleHolders");
    return this.store.holdersOf(this.state, roleId);
  }

  async openAccessIncreasedAlert(increase: RoleAccessIncrease): Promise<void> {
    this.beforeWrite("openAccessIncreasedAlert");
    this.state.alerts.push(structuredClone(increase));
  }

  private beforeWrite(operation: WriteOperation, writtenName?: string): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
    if (writtenName !== undefined && this.store.racedNames.has(writtenName.toLowerCase())) {
      throw new RoleNameConflict();
    }
  }
}

export class FakeRoleStore implements RoleStore, RoleDirectory {
  private state: FakeRoleStoreState = { roles: [], changes: [], alerts: [], createdRoles: 0 };

  failingWrites = new Set<WriteOperation>();
  racedNames = new Set<string>();
  operationOrder: string[] = [];

  seedRole(role: FakeRole): void {
    this.state.roles.push(structuredClone(role));
  }

  snapshot(): FakeRoleStoreState {
    return structuredClone(this.state);
  }

  holdersOf(state: FakeRoleStoreState, roleId: string): RoleHolder[] {
    return (state.roles.find((role) => role.id === roleId)?.holders ?? [])
      .filter((holder) => holder.active)
      .map(({ id, name }) => ({ id, name }));
  }

  async transaction<TOutcome>(
    work: (tx: RoleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeRoleStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  async roles(): Promise<RoleListing[]> {
    return this.state.roles.map((role) => ({
      id: role.id,
      name: role.name,
      isAdministrator: role.isAdministrator,
      storedPermissionKeys: role.storedPermissionKeys,
      activeHolderCount: this.holdersOf(this.state, role.id).length,
    }));
  }

  async role(roleId: string): Promise<StoredRole | undefined> {
    return this.state.roles.find((role) => role.id === roleId);
  }

  async activeRoleHolders(roleId: string): Promise<RoleHolder[]> {
    return this.holdersOf(this.state, roleId);
  }
}
