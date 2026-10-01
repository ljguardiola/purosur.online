import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../access/recovery-email-sender.js";
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
  it("runs the alert escalation job, escalating an overdue alert", async () => {
    const now = Date.now();
    const [overdue] = await db
      .insert(alerts)
      .values({
        kind: "user_email_changed",
        scope: "user-overdue",
        level: "warning",
        audience: "all",
        detail: {},
        openedAt: new Date(now - 25 * 60 * 60 * 1000),
        escalateAt: new Date(now - 60 * 60 * 1000),
      })
      .returning({ id: alerts.id });
    if (!overdue) {
      throw new Error("test setup: inserting the alert returned no row");
    }
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
        backofficeOrigin: "https://staging.purosur.online",
      },
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
    } finally {
      await recovery.close();
    }
  }, 60_000);
});
