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
const MINUTE_MS = 60 * 1000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_condition_resolution_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the background worker the server sets up on a real Postgres", () => {
  it("runs the alert condition resolution job by the clock it is handed, resolving only the alerts whose condition stayed cleared", async () => {
    const [stable, recent, holding] = await db
      .insert(alerts)
      .values(
        [
          ["register-stable", new Date(NOW.getTime() - 11 * MINUTE_MS)],
          ["register-recent", new Date(NOW.getTime() - 9 * MINUTE_MS)],
          ["register-holding", null],
        ].map(([scope, conditionClearedAt]) => ({
          kind: "update_required",
          scope: scope as string,
          level: "critical" as const,
          audience: "all" as const,
          detail: { deviceId: "device-1", appVersion: "0.9.0" },
          openedAt: new Date(NOW.getTime() - 60 * MINUTE_MS),
          conditionClearedAt: conditionClearedAt as Date | null,
        })),
      )
      .returning({ id: alerts.id });
    if (!stable || !recent || !holding) {
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
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;

      await vi.waitFor(
        async () => {
          const [row] = await db.select().from(alerts).where(eq(alerts.id, stable.id));
          expect(row?.resolvedAt).toEqual(NOW);
        },
        { timeout: 20_000, interval: 100 },
      );
      const [notYet] = await db.select().from(alerts).where(eq(alerts.id, recent.id));
      const [stillHolding] = await db.select().from(alerts).where(eq(alerts.id, holding.id));
      expect(notYet?.resolvedAt).toBeNull();
      expect(stillHolding?.resolvedAt).toBeNull();
    } finally {
      await recovery.close();
    }
  }, 60_000);
});
