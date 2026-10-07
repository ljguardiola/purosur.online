import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../access/recovery-email-sender.js";
import { UNREACHABLE_WSFE_ENDPOINT } from "../fiscal/test-support/fake-wsfe-server.js";
import { alerts } from "../platform/db/schema.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const NOW = new Date("2020-01-05T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_escalation_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the background worker the server sets up on a real Postgres", () => {
  it("runs the alert escalation job by the clock it is handed, escalating only the alerts overdue by it", async () => {
    const [overdue, dueLater] = await db
      .insert(alerts)
      .values([
        {
          kind: "user_email_changed",
          scope: "user-overdue",
          level: "warning",
          audience: "all",
          detail: {},
          openedAt: new Date(NOW.getTime() - 25 * HOUR_MS),
          escalateAt: new Date(NOW.getTime() - HOUR_MS),
        },
        {
          kind: "user_email_changed",
          scope: "user-due-later",
          level: "warning",
          audience: "all",
          detail: {},
          openedAt: new Date(NOW.getTime() - HOUR_MS),
          escalateAt: new Date(NOW.getTime() + HOUR_MS),
        },
      ])
      .returning({ id: alerts.id });
    if (!overdue || !dueLater) {
      throw new Error("test setup: inserting the alerts returned no rows");
    }
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => NOW,
      { emailSender: UNUSED_EMAIL_SENDER },
    );

    try {
      await sql`select graphile_worker.add_job('alert-escalation')`;

      await vi.waitFor(
        async () => {
          const [row] = await db.select().from(alerts).where(eq(alerts.id, overdue.id));
          expect(row?.level).toBe("critical");
        },
        { timeout: 20_000, interval: 100 },
      );
      const [notYetDue] = await db.select().from(alerts).where(eq(alerts.id, dueLater.id));
      expect(notYetDue?.level).toBe("warning");
    } finally {
      await recovery.close();
    }
  }, 60_000);
});
