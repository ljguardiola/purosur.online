import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function runbookBefore(keys: readonly string[]) {
  const database = await databaseBeforeMigration("_compromise_response_resend_api_key");
  const { rows: users } = await database.query<{ id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id`,
  );
  const userId = users[0]?.id as string;
  const { rows: responses } = await database.query<{ id: string }>(
    "insert into compromise_responses (started_at, started_by) values (now(), $1) returning id",
    [userId],
  );
  const responseId = responses[0]?.id as string;
  for (const key of keys) {
    await database.query(
      `insert into compromise_response_completions (response_id, key, done_by, done_at)
       values ($1, $2, $3, now())`,
      [responseId, key, userId],
    );
  }
  return { database, userId, responseId };
}

function recordCompletion(
  database: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  responseId: string,
  key: string,
  userId: string,
) {
  return database.query(
    `insert into compromise_response_completions (response_id, key, done_by, done_at)
     values ($1, $2, $3, now())`,
    [responseId, key, userId],
  );
}

describe("the migration that replaces the WhatsApp secrets with the Resend API key in the compromise runbook", {
  timeout: 30_000,
}, () => {
  it("drops the WhatsApp secrets already marked done and keeps every other completion", async () => {
    const { database, responseId } = await runbookBefore([
      "revoke_every_installation",
      "whatsapp_webhook_token",
      "whatsapp_webhook_secret",
      "claude_api_key",
    ]);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ key: string }>(
      "select key from compromise_response_completions where response_id = $1 order by key",
      [responseId],
    );
    expect(rows.map(({ key }) => key)).toEqual(["claude_api_key", "revoke_every_installation"]);
  });

  it("records the Resend API key as done", async () => {
    const { database, userId, responseId } = await runbookBefore([]);
    const migrated = await database.applyMigration();

    await recordCompletion(migrated, responseId, "resend_api_key", userId);

    const { rows } = await migrated.query<{ key: string }>(
      "select key from compromise_response_completions where response_id = $1",
      [responseId],
    );
    expect(rows.map(({ key }) => key)).toEqual(["resend_api_key"]);
  });

  it.each(["whatsapp_webhook_token", "whatsapp_webhook_secret"])(
    "refuses to record %s as done",
    async (key) => {
      const { database, userId, responseId } = await runbookBefore([]);
      const migrated = await database.applyMigration();

      await expect(recordCompletion(migrated, responseId, key, userId)).rejects.toThrow();
    },
  );
});
