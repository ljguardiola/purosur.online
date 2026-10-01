import type { Sessions, StoredSession } from "@purosur/domain/access/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { rolePermissions, roles, sessions, userRoles, users } from "../platform/db/schema.js";

class DrizzleSessions<TQueryResult extends PgQueryResultHKT> implements Sessions {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async findSession(sessionKey: string): Promise<StoredSession | undefined> {
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        firstName: users.firstName,
        locationId: users.locationId,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        revokedAt: sessions.revokedAt,
        passkeyAuthorizedAt: sessions.passkeyAuthorizedAt,
        userActive: users.active,
        isAdministrator: roles.isAdministrator,
        grantedPermissionKeys: sql<
          string[]
        >`array(select ${rolePermissions.permissionKey} from ${rolePermissions} where ${rolePermissions.roleId} = ${roles.id})`,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(sessions.sessionIdHash, sessionKey))
      .limit(1);
    return row && { ...row, isAdministrator: row.isAdministrator ?? false };
  }
}

export function drizzleSessions<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Sessions {
  return new DrizzleSessions(db);
}
