import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the recovery link sent migration applied over a database that already holds recovery tokens", {
  timeout: 30_000,
}, () => {
  it("marks a redeemed token as sent when it was issued and leaves an unredeemed one unsent", async () => {
    const database = await databaseBeforeMigration("_recovery_link_sent");

    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: userRows } = await database.query<{ id: string }>(
      "insert into users (first_name, email, location_id) values ($1, $2, $3) returning id",
      ["Rocío Fictaria", `rocio-${randomUUID()}@example.com`, locationRows[0]?.id],
    );
    const userId = userRows[0]?.id;
    const redeemedIssuedAt = "2026-10-01T10:00:00.000Z";
    const unredeemedIssuedAt = "2026-10-01T11:00:00.000Z";
    await database.query(
      `insert into recovery_tokens (user_id, token_hash, issued_at, expires_at, used_at)
       values ($1, 'redeemed-hash', $2, $2::timestamptz + interval '15 minutes', $2::timestamptz + interval '5 minutes')`,
      [userId, redeemedIssuedAt],
    );
    await database.query(
      `insert into recovery_tokens (user_id, token_hash, issued_at, expires_at)
       values ($1, 'unredeemed-hash', $2, $2::timestamptz + interval '15 minutes')`,
      [userId, unredeemedIssuedAt],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ token_hash: string; sent_at: Date | null }>(
      "select token_hash, sent_at from recovery_tokens order by issued_at",
    );
    expect(rows.map((row) => [row.token_hash, row.sent_at])).toEqual([
      ["redeemed-hash", new Date(redeemedIssuedAt)],
      ["unredeemed-hash", null],
    ]);
  });
});
