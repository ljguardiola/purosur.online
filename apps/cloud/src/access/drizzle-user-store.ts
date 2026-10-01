import {
  type AssignableRole,
  type BranchUsers,
  type LockedUser,
  type NewUser,
  type RoleWithPermissions,
  type StoredUserRevision,
  type UserAlert,
  type UserChange,
  UserEmailConflict,
  type UserRewrite,
  type UserStore,
  type UserStoreTransaction,
} from "@purosur/domain/access/use-cases";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import {
  auditLog,
  recoveryTokens,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

const UNIQUE_VIOLATION = "23505";
const USER_EMAIL_UNIQUE_INDEX = "users_email_key";

function violatesUserEmailIndex(error: unknown): boolean {
  return postgresErrorChain(error).some(
    (link) => link.code === UNIQUE_VIOLATION && link.constraint === USER_EMAIL_UNIQUE_INDEX,
  );
}

function auditValues(change: UserChange): { previousValue: unknown; newValue: unknown } {
  switch (change.kind) {
    case "created":
      return {
        previousValue: null,
        newValue: { firstName: change.firstName, email: change.email, roleId: change.roleId },
      };
    case "email_changed":
      return { previousValue: { email: change.previousEmail }, newValue: { email: change.email } };
    case "role_changed":
      return {
        previousValue: { roleId: change.previousRoleId },
        newValue: { roleId: change.roleId },
      };
    case "deactivated":
      return { previousValue: { active: true }, newValue: { active: false } };
    case "reactivated":
      return { previousValue: { active: false }, newValue: { active: true } };
  }
}

class DrizzleUserStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements UserStoreTransaction
{
  readonly users: BranchUsers;
  private readonly tx: Transaction<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: Transaction<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
    this.users = drizzleBranchUsers(tx);
  }

  async findRole(roleId: string): Promise<AssignableRole | undefined> {
    if (!UUID_PATTERN.test(roleId)) {
      return undefined;
    }
    const [role] = await this.tx
      .select({ id: roles.id, name: roles.name, isAdministrator: roles.isAdministrator })
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);
    return role;
  }

  async roleOfUser(userId: string): Promise<AssignableRole | undefined> {
    const [role] = await this.tx
      .select({ id: roles.id, name: roles.name, isAdministrator: roles.isAdministrator })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));
    return role;
  }

  async lockAdministratorRole(): Promise<{ id: string } | undefined> {
    const [role] = await this.tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true))
      .for("update");
    return role;
  }

  async lockRoleForAssignment(roleId: string): Promise<RoleWithPermissions> {
    const [role] = await this.tx
      .select({ name: roles.name, isAdministrator: roles.isAdministrator })
      .from(roles)
      .where(eq(roles.id, roleId))
      .for("share");
    if (!role) {
      throw new Error("an assigned role no longer exists");
    }
    const permissionRows = await this.tx
      .select({ permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return { ...role, permissionKeys: permissionRows.map((row) => row.permissionKey) };
  }

  async lockUser(userId: string): Promise<LockedUser | undefined> {
    if (!UUID_PATTERN.test(userId)) {
      return undefined;
    }
    const [user] = await this.tx
      .select({
        email: users.email,
        version: users.version,
        active: users.active,
        locationId: users.locationId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    return user;
  }

  async lockUserForDeactivation(userId: string): Promise<LockedUser | undefined> {
    if (!UUID_PATTERN.test(userId)) {
      return undefined;
    }
    const [user] = await this.tx
      .select({
        email: users.email,
        version: users.version,
        active: users.active,
        locationId: users.locationId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("no key update");
    return user;
  }

  activeAdministratorCount(locationId: string): Promise<number> {
    return this.users.activeAdministratorCount(locationId);
  }

  async insertUser(user: NewUser): Promise<StoredUserRevision> {
    const [inserted] = await this.tx
      .insert(users)
      .values({ firstName: user.firstName, email: user.email, locationId: user.locationId })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, version: users.version });
    if (!inserted) {
      throw new UserEmailConflict();
    }
    this.pending.note({
      entity: "user",
      entityId: inserted.id,
      version: inserted.version,
      op: "insert",
      locationId: user.locationId,
    });
    return inserted;
  }

  async assignRole(userId: string, roleId: string): Promise<void> {
    await this.tx.insert(userRoles).values({ userId, roleId });
  }

  async reassignRole(userId: string, roleId: string): Promise<void> {
    await this.tx.update(userRoles).set({ roleId }).where(eq(userRoles.userId, userId));
  }

  async rewriteUser(userId: string, rewrite: UserRewrite): Promise<void> {
    try {
      await this.tx
        .update(users)
        .set({
          version: rewrite.version,
          ...(rewrite.email === undefined ? {} : { email: rewrite.email }),
          ...(rewrite.active === undefined ? {} : { active: rewrite.active }),
        })
        .where(eq(users.id, userId));
    } catch (error) {
      if (violatesUserEmailIndex(error)) {
        throw new UserEmailConflict();
      }
      throw error;
    }
    this.pending.note({
      entity: "user",
      entityId: userId,
      version: rewrite.version,
      op: "update",
      locationId: rewrite.locationId,
    });
  }

  async voidOutstandingRecoveryTokens(userId: string, at: Date): Promise<void> {
    await this.tx
      .update(recoveryTokens)
      .set({ voidedAt: at })
      .where(
        and(
          eq(recoveryTokens.userId, userId),
          isNull(recoveryTokens.usedAt),
          isNull(recoveryTokens.voidedAt),
        ),
      );
  }

  async revokeSessions(userId: string, at: Date): Promise<void> {
    await this.tx
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async recordUserChange(userId: string, actorId: string, change: UserChange): Promise<void> {
    await this.tx
      .insert(auditLog)
      .values({ entity: "user", entityId: userId, actorId, ...auditValues(change) });
  }

  async openUserAlert(alert: UserAlert): Promise<void> {
    const deps = { now: () => alert.openedAt };
    switch (alert.kind) {
      case "created_as_administrator":
        await openAlert(
          this.tx,
          {
            kind: "user_access_increased",
            scope: alert.userId,
            detail: { cause: "created_as_administrator", actorId: alert.actorId },
          },
          deps,
        );
        return;
      case "email_changed":
        await openAlert(
          this.tx,
          {
            kind: "user_email_changed",
            scope: alert.userId,
            detail: {
              previousEmail: alert.previousEmail,
              newEmail: alert.newEmail,
              actorId: alert.actorId,
            },
          },
          deps,
        );
        return;
      case "role_assigned":
        await openAlert(
          this.tx,
          {
            kind: "user_access_increased",
            scope: alert.userId,
            detail: {
              cause: "role_assigned",
              previousRole: alert.previousRole,
              newRole: alert.newRole,
              actorId: alert.actorId,
            },
          },
          deps,
        );
        return;
    }
  }
}

export class DrizzleUserStore<TQueryResult extends PgQueryResultHKT> implements UserStore {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(work: (tx: UserStoreTransaction) => Promise<TOutcome>): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleUserStoreTransaction(tx, pending)),
    );
  }
}
