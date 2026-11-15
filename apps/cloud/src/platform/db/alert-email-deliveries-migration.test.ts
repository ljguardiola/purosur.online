import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the migration that records the email deliveries of alerts, over a database that already holds alerts", {
  timeout: 30_000,
}, () => {
  async function alertAndRecipientOver(
    database: Awaited<ReturnType<typeof databaseBeforeMigration>>,
  ) {
    const { rows: locations } = await database.query<{ id: string }>("select id from locations");
    const { rows: users } = await database.query<{ id: string }>(
      "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
      [locations[0]?.id],
    );
    const { rows: alerts } = await database.query<{ id: string }>(
      `insert into alerts (kind, scope, level, audience, detail)
       values ('user_email_changed', 'user-1', 'warning', 'all', '{}') returning id`,
    );
    return { alertId: alerts[0]?.id, userId: users[0]?.id };
  }

  it("keeps the existing alerts and starts with no email delivery", async () => {
    const database = await databaseBeforeMigration("_alert_email_deliveries");
    await alertAndRecipientOver(database);

    const migrated = await database.applyMigration();

    const { rows: alerts } = await migrated.query("select kind from alerts");
    expect(alerts).toEqual([{ kind: "user_email_changed" }]);
    const { rows: deliveries } = await migrated.query("select id from alert_email_deliveries");
    expect(deliveries).toEqual([]);
  });

  it("records a delivery as pending with no attempt made", async () => {
    const database = await databaseBeforeMigration("_alert_email_deliveries");
    const { alertId, userId } = await alertAndRecipientOver(database);
    const migrated = await database.applyMigration();

    await migrated.query(
      `insert into alert_email_deliveries (alert_id, recipient_user_id, stage, level, occurred_at)
       values ($1, $2, 'opened', 'warning', '2026-10-01T12:00:00.000Z')`,
      [alertId, userId],
    );

    const { rows } = await migrated.query(
      "select stage, level, status, attempts, next_attempt_at, error, provider_message_id, sent_at from alert_email_deliveries",
    );
    expect(rows).toEqual([
      {
        stage: "opened",
        level: "warning",
        status: "pending",
        attempts: 0,
        next_attempt_at: null,
        error: null,
        provider_message_id: null,
        sent_at: null,
      },
    ]);
  });

  it("refuses a second delivery of the same stage to the same recipient", async () => {
    const database = await databaseBeforeMigration("_alert_email_deliveries");
    const { alertId, userId } = await alertAndRecipientOver(database);
    const migrated = await database.applyMigration();
    const insert = () =>
      migrated.query(
        `insert into alert_email_deliveries (alert_id, recipient_user_id, stage, level, occurred_at)
         values ($1, $2, 'opened', 'warning', now())`,
        [alertId, userId],
      );
    await insert();

    await expect(insert()).rejects.toThrow(/alert_email_deliveries/);
  });

  it("accepts the three stages and the three statuses and refuses any other", async () => {
    const database = await databaseBeforeMigration("_alert_email_deliveries");
    const { alertId, userId } = await alertAndRecipientOver(database);
    const migrated = await database.applyMigration();
    const insert = (stage: string, status: string) =>
      migrated.query(
        `insert into alert_email_deliveries (alert_id, recipient_user_id, stage, level, occurred_at, status)
         values ($1, $2, $3, 'warning', now(), $4)`,
        [alertId, userId, stage, status],
      );

    await insert("opened", "pending");
    await insert("escalated", "sent");
    await insert("resolved", "failed");

    await expect(insert("closed", "pending")).rejects.toThrow(/alert_email_stage/);
    await expect(insert("opened", "bounced")).rejects.toThrow(/alert_email_delivery_status/);
  });
});
