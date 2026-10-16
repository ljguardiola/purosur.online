import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, sessions } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerEverySessionEndingRoute } from "./every-session-ending-route.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { registerSessionReadRoute } from "./session-read-route.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let locationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  locationId = await seededLocationId(db);
  app = Fastify();
  const options = { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => SESSION_NOON };
  registerEverySessionEndingRoute(app, options);
  registerSessionReadRoute(app, options);
});

afterEach(async () => {
  await app.close();
});

function endEverySession(headers: Record<string, string>) {
  return app.inject({ method: "DELETE", url: "/sessions", headers });
}

function readSession(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/sessions/current", headers });
}

async function openSession(email: string, permissionKeys: string[]) {
  return openBackofficeSession(db, { now: SESSION_NOON, locationId, permissionKeys, email });
}

describe("DELETE /sessions", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await endEverySession({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const administrator = await openSession("ada@example.com", ["manage_users"]);

    const response = await endEverySession({
      ...administrator.headers,
      origin: "https://evil.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without manage_users with 403 forbidden and ends no session", async () => {
    const cashier = await openSession("cashier@example.com", ["sell_and_charge"]);
    const administrator = await openSession("ada@example.com", ["manage_users"]);

    const response = await endEverySession(cashier.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(
      await db.select().from(sessions).where(eq(sessions.userId, administrator.userId)),
    ).toMatchObject([{ revokedAt: null }]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("ends every open session, the caller's included, so the next request of each is refused", async () => {
    const administrator = await openSession("ada@example.com", ["manage_users"]);
    const cashier = await openSession("cashier@example.com", ["sell_and_charge"]);
    expect((await readSession(cashier.headers)).statusCode).toBe(200);

    const response = await endEverySession(administrator.headers);

    expect(response.statusCode).toBe(200);
    for (const { headers } of [administrator, cashier]) {
      const next = await readSession(headers);
      expect(next.statusCode).toBe(401);
      expect(next.json()).toMatchObject({ code: "unauthenticated" });
    }
    const stored = await db.select().from(sessions);
    expect(stored).toHaveLength(2);
    expect(stored.every((session) => session.revokedAt?.getTime() === SESSION_NOON.getTime())).toBe(
      true,
    );
  });

  it("audits each ended session with the caller as actor", async () => {
    const administrator = await openSession("ada@example.com", ["manage_users"]);
    await openSession("cashier@example.com", ["sell_and_charge"]);

    await endEverySession(administrator.headers);

    const audits = await db.select().from(auditLog);
    const stored = await db.select().from(sessions);
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => audit.entityId).sort()).toEqual(
      stored.map((session) => session.id).sort(),
    );
    expect(audits.every((audit) => audit.entity === "session")).toBe(true);
    expect(audits.every((audit) => audit.actorId === administrator.userId)).toBe(true);
  });

  it("clears the caller's session cookie", async () => {
    const administrator = await openSession("ada@example.com", ["manage_users"]);

    const response = await endEverySession(administrator.headers);

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
  });
});
