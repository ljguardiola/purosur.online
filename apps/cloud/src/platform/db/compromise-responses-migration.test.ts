import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_compromise_responses");
  const { rows } = await database.query<{ id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id`,
  );
  const userId = rows[0]?.id as string;
  await database.query(
    "insert into audit_log (entity, entity_id, actor_id) values ('user', $1, $1)",
    [userId],
  );
  return { database, userId };
}

describe("the compromise-response migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the users and the audit log it finds", async () => {
    const { database, userId } = await databaseBefore();

    const migrated = await database.applyMigration();

    const { rows: users } = await migrated.query("select id from users where id = $1", [userId]);
    const { rows: audits } = await migrated.query("select id from audit_log where actor_id = $1", [
      userId,
    ]);
    expect(users).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("records a runbook and the steps and items done in it, who did them and when", async () => {
    const { database, userId } = await databaseBefore();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ id: string }>(
      "insert into compromise_responses (started_at, started_by) values (now(), $1) returning id",
      [userId],
    );
    const responseId = rows[0]?.id;
    await migrated.query(
      `insert into compromise_response_completions (response_id, key, done_by, done_at)
       values ($1, 'revoke_every_installation', $2, now()), ($1, 'claude_api_key', $2, now())`,
      [responseId, userId],
    );

    const { rows: done } = await migrated.query<{ key: string }>(
      "select key from compromise_response_completions where response_id = $1 order by key",
      [responseId],
    );
    expect(done.map(({ key }) => key)).toEqual(["claude_api_key", "revoke_every_installation"]);
  });

  it("refuses to record the same step or item twice in one runbook", async () => {
    const { database, userId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const { rows } = await migrated.query<{ id: string }>(
      "insert into compromise_responses (started_at, started_by) values (now(), $1) returning id",
      [userId],
    );
    const insert = () =>
      migrated.query(
        `insert into compromise_response_completions (response_id, key, done_by, done_at)
         values ($1, 'notify', $2, now())`,
        [rows[0]?.id, userId],
      );
    await insert();

    await expect(insert()).rejects.toThrow();
  });

  it("refuses a completion that is neither a step nor an item of the runbook", async () => {
    const { database, userId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const { rows } = await migrated.query<{ id: string }>(
      "insert into compromise_responses (started_at, started_by) values (now(), $1) returning id",
      [userId],
    );

    await expect(
      migrated.query(
        `insert into compromise_response_completions (response_id, key, done_by, done_at)
         values ($1, 're_enroll_registers', $2, now())`,
        [rows[0]?.id, userId],
      ),
    ).rejects.toThrow();
  });
});
