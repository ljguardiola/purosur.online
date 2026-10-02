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
} from "@purosur/domain/access/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { auditLog, rolePermissions, roles } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { drizzleRoleDirectory } from "./drizzle-role-directory.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

const UNIQUE_VIOLATION = "23505";
const ROLE_NAME_UNIQUE_INDEX = "roles_name_lower_key";

function violatesRoleNameIndex(error: unknown): boolean {
  return postgresErrorChain(error).some(
    (link) => link.code === UNIQUE_VIOLATION && link.constraint === ROLE_NAME_UNIQUE_INDEX,
  );
}

class DrizzleRoleStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RoleStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: Transaction<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockRole(roleId: string): Promise<LockRoleResult> {
    const [role] = await this.tx
      .select({ name: roles.name, isAdministrator: roles.isAdministrator, version: roles.version })
      .from(roles)
      .where(eq(roles.id, roleId))
      .for("update");
    return role ? { kind: "locked", role } : { kind: "not_found" };
  }

  async roleNameTaken(name: string, excludingRoleId?: string): Promise<boolean> {
    const [taken] = await this.tx
      .select({ id: roles.id })
      .from(roles)
      .where(
        excludingRoleId === undefined
          ? sql`lower(${roles.name}) = lower(${name})`
          : sql`lower(${roles.name}) = lower(${name}) and ${roles.id} != ${excludingRoleId}`,
      )
      .limit(1);
    return taken !== undefined;
  }

  async storedPermissionKeys(roleId: string): Promise<string[]> {
    const rows = await this.tx
      .select({ permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((row) => row.permissionKey);
  }

  async insertRole(role: NewRole): Promise<StoredRoleRevision> {
    const [inserted] = await this.writingRoleName(() =>
      this.tx
        .insert(roles)
        .values({ name: role.name, isAdministrator: false })
        .returning({ id: roles.id, version: roles.version }),
    );
    if (!inserted) {
      throw new Error("inserting the role returned no row");
    }
    this.pending.note({
      entity: "role",
      entityId: inserted.id,
      version: inserted.version,
      op: "insert",
    });
    await this.insertPermissions(inserted.id, role.permissionKeys);
    return inserted;
  }

  async rewriteRole(roleId: string, rewrite: RoleRewrite): Promise<void> {
    await this.writingRoleName(() =>
      this.tx
        .update(roles)
        .set({ name: rewrite.name, version: rewrite.version })
        .where(eq(roles.id, roleId)),
    );
    this.pending.note({
      entity: "role",
      entityId: roleId,
      version: rewrite.version,
      op: "update",
    });
    await this.tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    await this.insertPermissions(roleId, rewrite.permissionKeys);
  }

  async recordRoleChange(change: RoleChange): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "role",
      entityId: change.roleId,
      actorId: change.actorId,
      previousValue: change.previous && {
        name: change.previous.name,
        permissions: change.previous.permissionKeys,
      },
      newValue: { name: change.next.name, permissions: change.next.permissionKeys },
    });
  }

  activeRoleHolders(roleId: string) {
    return drizzleRoleDirectory(this.tx).activeRoleHolders(roleId);
  }

  async openAccessIncreasedAlert(increase: RoleAccessIncrease): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "user_access_increased",
        scope: increase.holderId,
        detail: {
          cause: "role_permissions_added",
          roleName: increase.roleName,
          addedPermissionKeys: increase.addedPermissionKeys,
          actorId: increase.actorId,
        },
      },
      { now: () => increase.openedAt },
    );
  }

  private async insertPermissions(roleId: string, permissionKeys: string[]): Promise<void> {
    if (permissionKeys.length === 0) {
      return;
    }
    await this.tx
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId, permissionKey })));
  }

  private async writingRoleName<TResult>(write: () => Promise<TResult>): Promise<TResult> {
    try {
      return await write();
    } catch (error) {
      if (violatesRoleNameIndex(error)) {
        throw new RoleNameConflict();
      }
      throw error;
    }
  }
}

export class DrizzleRoleStore<TQueryResult extends PgQueryResultHKT> implements RoleStore {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(work: (tx: RoleStoreTransaction) => Promise<TOutcome>): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleRoleStoreTransaction(tx, pending)),
    );
  }
}
