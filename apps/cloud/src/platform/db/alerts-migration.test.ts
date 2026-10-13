import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

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

describe("the alerts migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps prior rows intact and lets an alert and its delivery be recorded for data that already existed", async () => {
    const database = await databaseBeforeMigration("_alerts");

    const { rows: seededLocationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const seededLocation = seededLocationRows[0];
    if (!seededLocation) {
      throw new Error("test setup: no location seeded by the migrations run so far");
    }
    const actorId = await insertUser(database, seededLocation.id, "ada@example.com");
    await database.query(
      "insert into audit_log (entity, entity_id, actor_id, new_value) values ($1, $2, $3, $4)",
      ["user", actorId, actorId, JSON.stringify({ email: "ada.new@example.com" })],
    );

    const migrated = await database.applyMigration();

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

    const { rows: alertRows } = await migrated.query<{ id: string }>(
      `insert into alerts (kind, scope, level, audience, detail, resolved_by)
         values ($1, $2, $3, $4, $5, $6) returning id`,
      ["user_email_changed", actorId, "warning", "all", JSON.stringify({}), actorId],
    );
    const alert = alertRows[0];
    expect(alert?.id).toEqual(expect.any(String));

    await expect(
      migrated.query(
        "insert into alert_deliveries (alert_id, recipient_user_id) values ($1, $2) returning id",
        [alert?.id, actorId],
      ),
    ).resolves.toMatchObject({ rows: [{ id: expect.any(String) }] });
  });
});
