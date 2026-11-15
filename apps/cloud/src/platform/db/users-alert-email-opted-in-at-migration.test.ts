import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the migration that records when a user opted in to alerts by email, over a database that already holds users", {
  timeout: 30_000,
}, () => {
  it("leaves every existing user without an opt-in and logs no change for them", async () => {
    const database = await databaseBeforeMigration("_users_alert_email_opted_in_at");
    const { rows: locations } = await database.query<{ id: string }>("select id from locations");
    await database.query(
      "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1)",
      [locations[0]?.id],
    );
    const { rows: changesBefore } = await database.query("select change_seq from changes");

    const migrated = await database.applyMigration();

    const { rows: users } = await migrated.query(
      "select first_name, alert_email_opted_in_at, version from users",
    );
    expect(users).toEqual([{ first_name: "Ada", alert_email_opted_in_at: null, version: 1 }]);
    const { rows: changesAfter } = await migrated.query("select change_seq from changes");
    expect(changesAfter).toEqual(changesBefore);
  });

  it("stores the moment of an opt-in with its time zone", async () => {
    const database = await databaseBeforeMigration("_users_alert_email_opted_in_at");
    const migrated = await database.applyMigration();
    const { rows: locations } = await migrated.query<{ id: string }>("select id from locations");

    await migrated.query(
      `insert into users (first_name, email, location_id, alert_email_opted_in_at)
       values ('Grace', 'grace@example.com', $1, '2026-10-01T12:00:00.000Z')`,
      [locations[0]?.id],
    );

    const { rows } = await migrated.query<{ at: Date }>(
      "select alert_email_opted_in_at as at from users where first_name = 'Grace'",
    );
    expect(rows[0]?.at.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });
});
