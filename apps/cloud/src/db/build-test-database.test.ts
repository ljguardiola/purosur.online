import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
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

async function migrationsFolderWith(statements: string[]): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "build-test-database-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, "meta"));
  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [{ idx: 0, version: "7", when: 0, tag: "0000_only", breakpoints: true }],
    }),
  );
  await writeFile(join(folder, "0000_only.sql"), statements.join("\n--> statement-breakpoint\n"));
  return folder;
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
    onTestFinished(clear);

    const baseline = await countsByTable(client);
    // Fails loudly instead of vacuously passing if the schema ever loses every table.
    expect(baseline.size).toBeGreaterThanOrEqual(12);
    // The migrations seed the single Administrator role; the baseline must hold it for the
    // comparison below to prove clear() restores it.
    expect(baseline.get("roles")).toBe(1);

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

  it("removes a row on clear(), so its unique values can be inserted again", async () => {
    const { db, clear } = testDatabase;
    onTestFinished(clear);
    await db.insert(users).values({ firstName: "Grace", email: "grace@example.com" });

    await clear();

    // The email is unique: reinserting it only succeeds because clear() actually removed the row.
    const [user] = await db
      .insert(users)
      .values({ firstName: "Grace", email: "grace@example.com" })
      .returning({ id: users.id });
    expect(user).toBeDefined();
  });

  it("restores seeded rows on clear() whatever order their tables reference each other in", async () => {
    // Each table references the other, so no insertion order of the two seeded rows satisfies
    // both foreign keys at once.
    const migrationsFolder = await migrationsFolderWith([
      'create table "seed_a" ("id" integer primary key, "b_id" integer)',
      'create table "seed_b" ("id" integer primary key, "a_id" integer not null references "seed_a" ("id"))',
      'alter table "seed_a" add foreign key ("b_id") references "seed_b" ("id")',
      'insert into "seed_a" ("id") values (1)',
      'insert into "seed_b" ("id", "a_id") values (1, 1)',
      'update "seed_a" set "b_id" = 1',
    ]);
    const ownDatabase = await buildTestDatabase({ migrationsFolder });
    onTestFinished(() => ownDatabase.close());

    await ownDatabase.clear();

    const { rows } = await ownDatabase.client.query(
      'select "seed_a"."b_id", "seed_b"."a_id" from "seed_a", "seed_b"',
    );
    expect(rows).toEqual([{ b_id: 1, a_id: 1 }]);
  });

  it("closes its database and rejects with the migration's own error when migrating fails", async () => {
    const migrationsFolder = await migrationsFolderWith(["select * from missing_table"]);
    // The database the migration ran against is the one that received queries.
    const query = vi.spyOn(PGlite.prototype, "query");
    onTestFinished(() => query.mockRestore());

    const attempt = buildTestDatabase({ migrationsFolder }).then((database) => {
      onTestFinished(() => database.close());
      return database;
    });
    await expect(attempt).rejects.toThrow(/missing_table/);

    const queried = new Set(query.mock.contexts);
    expect(queried.size).toBeGreaterThan(0);
    for (const database of queried) {
      expect(database).toHaveProperty("closed", true);
    }
  });

  it("rejects with the migration's own error even when closing its database also fails", async () => {
    const migrationsFolder = await migrationsFolderWith(["select * from missing_table"]);
    // PGlite also closes a throwaway instance of its own while starting up; only the database the
    // migration queried is made to fail on close.
    const query = vi.spyOn(PGlite.prototype, "query");
    onTestFinished(() => query.mockRestore());
    const realClose = PGlite.prototype.close;
    const close = vi.spyOn(PGlite.prototype, "close").mockImplementation(async function (
      this: PGlite,
    ) {
      await realClose.call(this);
      if (query.mock.contexts.includes(this)) {
        throw new Error("close failed");
      }
    });
    onTestFinished(() => close.mockRestore());

    const attempt = buildTestDatabase({ migrationsFolder }).then((database) => {
      onTestFinished(() => database.close());
      return database;
    });
    await expect(attempt).rejects.toThrow(/missing_table/);
    // The rejected close really was attempted: the error it raised was the one swallowed.
    expect(query.mock.contexts.some((database) => close.mock.contexts.includes(database))).toBe(
      true,
    );
  });
});
