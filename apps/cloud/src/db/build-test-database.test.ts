import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "./build-test-database.js";
import {
  auditLog,
  passkeys,
  recoveryRateLimitAttempts,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  roles,
  sessions,
  signInChallenges,
  signInFailures,
  signInLockouts,
  userRoles,
  users,
} from "./schema.js";

async function countsByTable(client: PGlite): Promise<Map<string, number>> {
  const { rows } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  const counts = new Map<string, number>();
  for (const { tablename } of rows) {
    const result = await client.query<{ count: number }>(`select count(*) from "${tablename}"`);
    counts.set(tablename, result.rows[0]?.count ?? 0);
  }
  return counts;
}

describe("buildTestDatabase", () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  it("empties every application table on clear(), restoring only what the migrations themselves seeded", async () => {
    const { db, client, clear } = testDatabase;

    const baseline = await countsByTable(client);
    // Fails loudly instead of vacuously passing if the schema ever loses every table.
    expect(baseline.size).toBeGreaterThanOrEqual(12);

    const [user] = await db
      .insert(users)
      .values({ firstName: "Ada", email: "ada@example.com" })
      .returning({ id: users.id });
    const [role] = await db
      .insert(roles)
      .values({ name: "Cashier", isAdministrator: false })
      .returning({ id: roles.id });
    if (!user || !role) {
      throw new Error("seeding users/roles returned no row");
    }

    await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
    await db.insert(auditLog).values({ entity: "users", entityId: user.id });
    await db.insert(passkeys).values({
      userId: user.id,
      credentialId: "credential-1",
      publicKey: "public-key",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
    });
    await db.insert(recoveryTokens).values({
      userId: user.id,
      tokenHash: "token-hash",
      expiresAt: new Date("2026-01-05T12:15:00.000Z"),
    });
    await db.insert(recoveryRateLimitAttempts).values({
      keyKind: "source_address",
      keyValue: "203.0.113.10",
      attemptedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(recoveryRejectedAttemptAccumulator).values({
      kind: "request",
      keyHash: "key-hash",
      windowStart: new Date("2026-01-05T12:00:00.000Z"),
      firstAt: new Date("2026-01-05T12:00:00.000Z"),
      lastAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(sessions).values({ userId: user.id, sessionIdHash: "session-hash" });
    await db.insert(signInChallenges).values({ challenge: "challenge-1" });
    await db
      .insert(signInFailures)
      .values({ sourceAddress: "203.0.113.10", attemptedAt: new Date("2026-01-05T12:00:00.000Z") });
    await db.insert(signInLockouts).values({
      sourceAddress: "203.0.113.10",
      blockedUntil: new Date("2026-01-05T12:15:00.000Z"),
    });

    const afterSeeding = await countsByTable(client);
    for (const [tablename, count] of afterSeeding) {
      expect(count, `table ${tablename} was not seeded before clear()`).toBeGreaterThan(
        baseline.get(tablename) ?? 0,
      );
    }

    await clear();

    expect(await countsByTable(client)).toEqual(baseline);
  });

  it("leaves the schema usable for the next test, with no leftover row from the previous one", async () => {
    // Reinserts the exact same unique email the previous test used: this only succeeds because
    // clear() actually removed that row instead of merely appearing to.
    const [user] = await testDatabase.db
      .insert(users)
      .values({ firstName: "Ada", email: "ada@example.com" })
      .returning({ id: users.id });

    expect(user).toBeDefined();

    await testDatabase.clear();
  });
});
