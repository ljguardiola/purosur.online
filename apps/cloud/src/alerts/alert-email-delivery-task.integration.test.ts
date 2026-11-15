import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER,
  alertEmailDeliveryJobs,
} from "./alert-email-delivery-task.js";
import { FakeAlertEmailSender } from "./test-support/fake-alert-email-sender.js";

const NOW = new Date("2026-10-09T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_email_delivery_task");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the alert email delivery task on a real Postgres", () => {
  it("ends its run at once, sending nothing and saying so, while another run holds the lane", async () => {
    const [location] = await sql<{ id: string }[]>`select id from locations limit 1`;
    const [user] = await sql<{ id: string }[]>`
      insert into users (first_name, email, location_id, alert_email_opted_in_at)
      values ('Ada', 'ada@example.com', ${location?.id ?? null}, now())
      returning id`;
    const [alert] = await sql<{ id: string }[]>`
      insert into alerts (kind, scope, level, audience, detail)
      values ('register_silent', 'register-1', 'warning', 'all', '{}')
      returning id`;
    await sql`
      insert into alert_email_deliveries (alert_id, recipient_user_id, stage, level, occurred_at)
      values (${alert?.id ?? null}, ${user?.id ?? null}, 'opened', 'warning', now())`;
    const sender = new FakeAlertEmailSender();
    const task = alertEmailDeliveryJobs({
      now: () => NOW,
      sender,
      db: drizzle(sql),
      connections: postgresDedicatedConnections(sql),
    }).taskList[ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered alert email delivery task");
    }
    const otherRun = await sql.reserve();
    try {
      await otherRun`select pg_advisory_lock(hashtextextended('alert_email_delivery', 0))`;
      const { helpers, logs } = buildJobHelpers();

      await task({}, helpers);

      expect(sender.sent).toEqual([]);
      expect(logs.map((line) => line.message)).toContain(
        "Alert emails: another run is still sending them",
      );
    } finally {
      await otherRun`select pg_advisory_unlock_all()`;
      otherRun.release();
    }
  }, 60_000);
});
