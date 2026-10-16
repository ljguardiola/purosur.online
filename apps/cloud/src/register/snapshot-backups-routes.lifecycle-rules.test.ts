import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, registerSnapshotLifecycleRules } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, SESSION_NOON } from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { backupsSession, buildBackupsApp } from "./test-support/snapshot-backups-routes.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = buildBackupsApp(db);
});

afterEach(async () => {
  await app.close();
});

function putRules(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({ method: "PUT", url: "/snapshot-backups/lifecycle-rules", headers, payload });
}

const rules = { hourly: 12, daily: 14, monthly: 6 };

async function auditedRuleChanges() {
  return db.select().from(auditLog).where(eq(auditLog.entity, "register_snapshot_lifecycle_rules"));
}

describe("PUT /snapshot-backups/lifecycle-rules", () => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await putRules(rules, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const session = await backupsSession(db);

    const response = await putRules(rules, {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(registerSnapshotLifecycleRules)).toEqual([]);
  });

  it("answers 403 forbidden to a user without the backups permission, changing nothing", async () => {
    const session = await backupsSession(db, { permissionKeys: ["sell_and_charge"] });

    const response = await putRules(rules, session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(registerSnapshotLifecycleRules)).toEqual([]);
  });

  it("answers 401 authorization_required without a recent passkey, changing nothing", async () => {
    const session = await backupsSession(db, { passkeyAuthorized: false });

    const response = await putRules(rules, session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(registerSnapshotLifecycleRules)).toEqual([]);
  });

  it("answers 400 validation_failed for a body outside the limits, before asking for a passkey", async () => {
    const session = await backupsSession(db, { passkeyAuthorized: false });

    const response = await putRules({ ...rules, hourly: 500 }, session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "hourly" }],
    });
    expect(await db.select().from(registerSnapshotLifecycleRules)).toEqual([]);
  });

  it("stores the rules and answers them, audited under the actor with the previous defaults", async () => {
    const session = await backupsSession(db);

    const response = await putRules(rules, session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(rules);
    expect(await db.select().from(registerSnapshotLifecycleRules)).toMatchObject([rules]);
    expect(await auditedRuleChanges()).toMatchObject([
      {
        actorId: session.userId,
        previousValue: { hourly: 24, daily: 30, monthly: 12 },
        newValue: rules,
        at: SESSION_NOON,
      },
    ]);
  });

  it("replaces rules already stored", async () => {
    await db.insert(registerSnapshotLifecycleRules).values({ hourly: 24, daily: 30, monthly: 12 });
    const session = await backupsSession(db);

    const response = await putRules(rules, session.headers);

    expect(response.statusCode).toBe(200);
    expect(await db.select().from(registerSnapshotLifecycleRules)).toMatchObject([rules]);
  });

  it("answers the same rules and audits nothing when they are already in force", async () => {
    await db.insert(registerSnapshotLifecycleRules).values(rules);
    const session = await backupsSession(db);

    const response = await putRules(rules, session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(rules);
    expect(await auditedRuleChanges()).toEqual([]);
  });
});
