import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import { rolePermissions, roles, sessions, userRoles, users } from "../platform/db/schema.js";

export const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
export const SESSION_NOON = new Date("2026-01-05T12:00:00.000Z");

export interface BackofficeSession {
  userId: string;
  headers: Record<string, string>;
}

export async function openBackofficeSession<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: {
    now: Date;
    locationId: string;
    permissionKeys: string[];
    passkeyAuthorized?: boolean;
    email?: string;
  },
): Promise<BackofficeSession> {
  const [role] = await db
    .insert(roles)
    .values({ name: `Encargada ${options.permissionKeys.join("-")}`, isAdministrator: false })
    .returning({ id: roles.id });
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: options.email ?? "ada@example.com",
      locationId: options.locationId,
    })
    .returning({ id: users.id });
  if (!role || !user) {
    throw new Error("test setup: seeding the role or the user returned no row");
  }
  if (options.permissionKeys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(options.permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });

  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId: user.id,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: options.now,
    lastSeenAt: options.now,
    passkeyAuthorizedAt: options.passkeyAuthorized === false ? null : options.now,
  });
  return {
    userId: user.id,
    headers: { origin: BACKOFFICE_ORIGIN, cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
  };
}
