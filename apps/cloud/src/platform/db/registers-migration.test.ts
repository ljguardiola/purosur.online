import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function insertLocation(database: SqlOnlyDatabase): Promise<string> {
  const { rows } = await database.query<{ id: string }>(
    "insert into locations default values returning id",
  );
  const location = rows[0];
  if (!location) {
    throw new Error("test setup: seeding a location returned no row");
  }
  return location.id;
}

async function insertUser(
  database: SqlOnlyDatabase,
  locationId: string,
  email: string,
): Promise<string> {
  const { rows } = await database.query<{ id: string }>(
    "insert into users (first_name, email, location_id) values ($1, $2, $3) returning id",
    ["Ada Lucero", email, locationId],
  );
  const user = rows[0];
  if (!user) {
    throw new Error("test setup: seeding a user returned no row");
  }
  return user.id;
}

describe("the registers migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps prior rows intact and lets a register be created for a location that already existed", async () => {
    const database = await databaseBeforeMigration("_registers");

    const { rows: seededLocationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const seededLocation = seededLocationRows[0];
    if (!seededLocation) {
      throw new Error("test setup: no location seeded by the migrations run so far");
    }
    const otherLocationId = await insertLocation(database);
    const actorId = await insertUser(
      database,
      seededLocation.id,
      `ada-${randomUUID()}@example.com`,
    );
    await database.query(
      "insert into audit_log (entity, entity_id, actor_id, new_value) values ($1, $2, $3, $4)",
      ["user", actorId, actorId, JSON.stringify({ email: `ada-${randomUUID()}@example.com` })],
    );

    const migrated = await database.applyMigration();

    const { rows: locationsAfter } = await migrated.query<{ id: string }>(
      "select id from locations",
    );
    expect(locationsAfter.map((row) => row.id).sort()).toEqual(
      [seededLocation.id, otherLocationId].sort(),
    );
    const { rows: usersAfter } = await migrated.query<{ id: string }>(
      "select id from users where id = $1",
      [actorId],
    );
    expect(usersAfter).toHaveLength(1);
    const { rows: auditAfter } = await migrated.query<{ entity_id: string }>(
      "select entity_id from audit_log where entity_id = $1",
      [actorId],
    );
    expect(auditAfter).toHaveLength(1);

    await expect(
      migrated.query("insert into registers (location_id, name) values ($1, $2) returning id", [
        seededLocation.id,
        "Caja 1",
      ]),
    ).resolves.toMatchObject({ rows: [{ id: expect.any(String) }] });
  });
});
