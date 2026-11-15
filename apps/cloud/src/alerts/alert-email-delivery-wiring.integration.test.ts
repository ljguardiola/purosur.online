import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { UNREACHABLE_WSFE_ENDPOINT } from "../fiscal/test-support/fake-wsfe-server.js";
import { alertEmailDeliveries, alerts, users } from "../platform/db/schema.js";
import { setUpBackgroundJobs } from "../server.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";
import { FakeAlertEmailSender } from "./test-support/fake-alert-email-sender.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const NOW = new Date("2020-01-05T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_email_delivery_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the background worker the server sets up on a real Postgres", () => {
  it("runs the alert email delivery job, sending the pending email through the sender it is given", async () => {
    const [location] = await sql<{ id: string }[]>`select id from locations limit 1`;
    const [recipient] = await db
      .insert(users)
      .values({ firstName: "Ada", email: "ada@example.com", locationId: location?.id ?? "" })
      .returning({ id: users.id });
    const [alert] = await db
      .insert(alerts)
      .values({
        kind: "register_silent",
        scope: "register-1",
        level: "warning",
        audience: "all",
        detail: {},
        openedAt: NOW,
      })
      .returning({ id: alerts.id });
    if (!recipient || !alert) {
      throw new Error("test setup: inserting the recipient and the alert returned no rows");
    }
    const [delivery] = await db
      .insert(alertEmailDeliveries)
      .values({
        alertId: alert.id,
        recipientUserId: recipient.id,
        stage: "opened",
        level: "warning",
        occurredAt: NOW,
      })
      .returning({ id: alertEmailDeliveries.id });
    if (!delivery) {
      throw new Error("test setup: inserting the delivery returned no row");
    }
    const sender = new FakeAlertEmailSender({ kind: "sent", providerMessageId: "msg-1" });
    const backgroundJobs = await setUpBackgroundJobs(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => NOW,
      fixedZoneRulesSource(),
      { emailSender: UNUSED_EMAIL_SENDER, alertEmailSender: sender, schedules: false },
    );

    try {
      await sql`select graphile_worker.add_job('alert-email-delivery')`;

      await vi.waitFor(
        async () => {
          const [row] = await db
            .select()
            .from(alertEmailDeliveries)
            .where(eq(alertEmailDeliveries.id, delivery.id));
          expect(row).toMatchObject({ status: "sent", providerMessageId: "msg-1" });
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(sender.sent).toMatchObject([{ to: "ada@example.com", alertId: alert.id }]);
    } finally {
      await backgroundJobs.close();
    }
  }, 60_000);
});
