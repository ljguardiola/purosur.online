import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  alerts,
  auditLog,
  locations,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { hashSourceAddress } from "../session/sign-in-lockout.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerAlertCloseRoute } from "./alert-close-route.js";
import { openAlert } from "./open-alert.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const SOURCE_ADDRESS = "203.0.113.5";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let ownLocationId: string;
let otherLocationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  ownLocationId = await seededLocationId(db);
  const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!otherLocation) throw new Error("test setup: inserting the other location returned no row");
  otherLocationId = otherLocation.id;

  app = Fastify();
  registerAlertCloseRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

async function insertRole(name: string, permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: `${name}-role`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) throw new Error("test setup: inserting the role returned no row");
  for (const permissionKey of permissionKeys) {
    await db.insert(rolePermissions).values({ roleId: role.id, permissionKey });
  }
  return role.id;
}

async function insertUserWithRole(
  firstName: string,
  roleId: string,
  locationId: string = ownLocationId,
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName,
      email: `${firstName.toLowerCase()}@example.com`,
      locationId,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("test setup: inserting the user returned no row");
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

async function insertAlert(input: {
  audience: "local" | "all";
  locationId?: string | null;
  resolvedAt?: Date | null;
}): Promise<string> {
  const [row] = await db
    .insert(alerts)
    .values({
      kind: "user_email_changed",
      scope: "a-user-id",
      level: "warning",
      audience: input.audience,
      locationId: input.audience === "local" ? (input.locationId ?? ownLocationId) : null,
      detail: {},
      openedAt: NOON,
      resolvedAt: input.resolvedAt ?? null,
    })
    .returning({ id: alerts.id });
  if (!row) throw new Error("test setup: inserting the alert returned no row");
  return row.id;
}

function closeAlertRequest(
  rawSessionId: string | undefined,
  id: string,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/alerts/${id}/close`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
  });
}

describe("POST /alerts/:id/close", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await closeAlertRequest(undefined, "00000000-0000-0000-0000-000000000000");

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const roleId = await insertRole("closer", ["dismiss_alerts_manually", "view_all_alerts"]);
    const userId = await insertUserWithRole("Grace", roleId);
    const rawSessionId = await insertSession(userId);
    const alertId = await insertAlert({ audience: "all" });

    const response = await closeAlertRequest(rawSessionId, alertId, {
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 403 forbidden for a user without dismiss_alerts_manually", async () => {
    const roleId = await insertRole("viewer", ["view_all_alerts"]);
    const userId = await insertUserWithRole("Grace", roleId);
    const rawSessionId = await insertSession(userId);
    const alertId = await insertAlert({ audience: "all" });

    const response = await closeAlertRequest(rawSessionId, alertId);

    expect(response.statusCode).toBe(403);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row?.resolvedAt).toBeNull();
  });

  it("returns 404 for an alert outside the actor's visibility even when they hold dismiss_alerts_manually", async () => {
    const roleId = await insertRole("local-closer", [
      "dismiss_alerts_manually",
      "view_branch_alerts",
    ]);
    const userId = await insertUserWithRole("Cajera", roleId);
    const rawSessionId = await insertSession(userId);
    const invisibleAlertId = await insertAlert({ audience: "local", locationId: otherLocationId });

    const response = await closeAlertRequest(rawSessionId, invisibleAlertId);

    expect(response.statusCode).toBe(404);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, invisibleAlertId));
    expect(row?.resolvedAt).toBeNull();
  });

  it("closes a visible alert, recording who closed it and an audit log entry", async () => {
    const roleId = await insertRole("closer", ["dismiss_alerts_manually", "view_all_alerts"]);
    const userId = await insertUserWithRole("Grace", roleId);
    const rawSessionId = await insertSession(userId);
    const alertId = await insertAlert({ audience: "all" });

    const response = await closeAlertRequest(rawSessionId, alertId);

    expect(response.statusCode).toBe(200);
    const body = response.json() as { resolved_at: string | null };
    expect(body.resolved_at).toBe(NOON.toISOString());
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ resolvedAt: NOON, resolvedBy: userId });
    const [auditRow] = await db.select().from(auditLog).where(eq(auditLog.entityId, alertId));
    expect(auditRow).toMatchObject({
      entity: "alert",
      actorId: userId,
      previousValue: { resolvedAt: null },
      newValue: { resolvedAt: NOON.toISOString() },
    });
  });

  it("keeps a lockout alert's source address only while it's open, hashing it on close", async () => {
    const roleId = await insertRole("closer", ["dismiss_alerts_manually", "view_all_alerts"]);
    const userId = await insertUserWithRole("Grace", roleId);
    const rawSessionId = await insertSession(userId);
    const opened = await db.transaction((tx) =>
      openAlert(
        tx,
        {
          kind: "backoffice_sign_in_lockout",
          scope: SOURCE_ADDRESS,
          detail: { sourceAddress: SOURCE_ADDRESS, failureCount: 6 },
        },
        { now: () => NOON },
      ),
    );

    const response = await closeAlertRequest(rawSessionId, opened.alertId);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(SOURCE_ADDRESS);
    expect(response.body).not.toContain(hashSourceAddress(SOURCE_ADDRESS));
    expect(response.json()).toMatchObject({
      scope: null,
      scope_display: null,
      detail: { failureCount: 6 },
    });
    expect(response.json()).not.toHaveProperty("detail.sourceAddress");
    const [row] = await db.select().from(alerts).where(eq(alerts.id, opened.alertId));
    expect(row).toMatchObject({
      scope: hashSourceAddress(SOURCE_ADDRESS),
      detail: { sourceAddress: hashSourceAddress(SOURCE_ADDRESS), failureCount: 6 },
    });
  });

  it("opens a new lockout alert for the same source address once the earlier one is closed", async () => {
    const roleId = await insertRole("closer", ["dismiss_alerts_manually", "view_all_alerts"]);
    const userId = await insertUserWithRole("Grace", roleId);
    const rawSessionId = await insertSession(userId);
    const lockout = {
      kind: "backoffice_sign_in_lockout",
      scope: SOURCE_ADDRESS,
      detail: { sourceAddress: SOURCE_ADDRESS, failureCount: 6 },
    } as const;
    const first = await db.transaction((tx) => openAlert(tx, lockout, { now: () => NOON }));
    const duplicate = await db.transaction((tx) => openAlert(tx, lockout, { now: () => NOON }));
    await closeAlertRequest(rawSessionId, first.alertId);

    const second = await db.transaction((tx) => openAlert(tx, lockout, { now: () => NOON }));

    expect(duplicate).toEqual({ kind: "already_open", alertId: first.alertId });
    expect(second.kind).toBe("opened");
    const [row] = await db.select().from(alerts).where(eq(alerts.id, second.alertId));
    expect(row?.scope).toBe(SOURCE_ADDRESS);
  });

  it("refuses to close an alert that was already closed", async () => {
    const roleId = await insertRole("closer", ["dismiss_alerts_manually", "view_all_alerts"]);
    const userId = await insertUserWithRole("Grace", roleId);
    const rawSessionId = await insertSession(userId);
    const alertId = await insertAlert({ audience: "all", resolvedAt: NOON });

    const response = await closeAlertRequest(rawSessionId, alertId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_closed" });
  });
});
