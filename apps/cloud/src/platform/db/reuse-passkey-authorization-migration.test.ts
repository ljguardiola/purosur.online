import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("migrating a database with a pending passkey challenge of a removed kind", {
  timeout: 30_000,
}, () => {
  async function sessionOnDatabaseBeforeAuthorizationReuse() {
    const database = await databaseBeforeMigration("_reuse_passkey_authorization");
    const { rows: userRows } = await database.query<{ id: string }>(
      `insert into "users" ("first_name", "email", "location_id") values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning "id"`,
    );
    const { rows: sessionRows } = await database.query<{ id: string }>(
      `insert into "sessions" ("user_id", "session_id_hash") values ($1, 'a-session-hash') returning "id"`,
      [userRows[0]?.id],
    );
    return { database, sessionId: sessionRows[0]?.id };
  }

  it("deletes a pending registration issued before passkey registration required an authorization", async () => {
    const { database, sessionId } = await sessionOnDatabaseBeforeAuthorizationReuse();
    await database.query(
      `insert into "passkey_challenges" ("session_id", "kind", "reauthentication_challenge", "registration_challenge") values ($1, 'registration', 'a-stale-reauthentication', 'a-stale-registration')`,
      [sessionId],
    );

    const migrated = await database.applyMigration();

    const { rows: remaining } = await migrated.query(
      `select * from "passkey_challenges" where "session_id" = $1`,
      [sessionId],
    );
    expect(remaining).toHaveLength(0);
  });

  it("deletes the pending row instead of leaving a kind the new enum no longer has", async () => {
    const { database, sessionId } = await sessionOnDatabaseBeforeAuthorizationReuse();
    await database.query(
      `insert into "passkey_challenges" ("session_id", "kind", "reauthentication_challenge") values ($1, 'role_creation', 'a-stale-challenge')`,
      [sessionId],
    );

    const migrated = await database.applyMigration();

    const { rows: remaining } = await migrated.query(
      `select * from "passkey_challenges" where "session_id" = $1`,
      [sessionId],
    );
    expect(remaining).toHaveLength(0);
    const { rows: enumValues } = await migrated.query<{ enumlabel: string }>(
      `select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid where pg_type.typname = 'passkey_management_challenge_kind' order by enumsortorder`,
    );
    expect(enumValues.map((row) => row.enumlabel)).toEqual([
      "registration",
      "session_authorization",
    ]);
  });
});
