import { randomUUID } from "node:crypto";
import type { PushedEvent } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../access/recovery-email-sender.js";
import { UNREACHABLE_WSFE_ENDPOINT } from "../fiscal/test-support/fake-wsfe-server.js";
import { inbox, salePayments, sales } from "../platform/db/schema.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { setUpRecovery } from "../server.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleInbox } from "./drizzle-inbox.js";
import { enqueueEventApplicationJob } from "./graphile-event-application-queue.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const NOW = new Date("2026-10-06T15:00:00.000Z");
const USER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("apply_synced_events_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function pushed(
  deviceSeq: number,
  event: Pick<PushedEvent, "aggregate_type" | "aggregate_id" | "event_type" | "payload">,
): PushedEvent {
  return {
    event_id: randomUUID(),
    device_seq: deviceSeq,
    schema_version: event.event_type === "sale_completed" ? 2 : 1,
    occurred_at: "2026-10-06T11:20:00.000Z",
    actor_id: USER,
    chain_hmac: "hmac",
    ...event,
  };
}

describe("the background worker the server sets up on a real Postgres", () => {
  it("applies a pushed sale, with its cash session, as soon as the events are received", async () => {
    const { deviceId } = await insertEnrolledInstallation(db, { now: NOW });
    const sessionId = randomUUID();
    const saleId = randomUUID();
    const events = [
      pushed(1, {
        aggregate_type: "CashSession",
        aggregate_id: sessionId,
        event_type: "cash_session_opened",
        payload: {
          opened_by: USER,
          opened_at: "2026-10-06T11:00:00.000Z",
          opening_float: 10000,
        },
      }),
      pushed(2, {
        aggregate_type: "Sale",
        aggregate_id: saleId,
        event_type: "sale_completed",
        payload: {
          id: saleId,
          register_id: randomUUID(),
          device_id: deviceId,
          session_id: sessionId,
          actor_id: USER,
          occurred_at: "2026-10-06T11:20:00.000Z",
          total: 4800,
          lines: [],
          cash_movements: [],
          payments: [
            {
              id: randomUUID(),
              kind: "SALE",
              method: "CASH",
              provider: "NONE",
              amount: 4800,
              tendered: 5000,
              state: "APPROVED",
              occurred_at: "2026-10-06T11:20:00.000Z",
              authorized_by: null,
              confirmed_at: null,
            },
          ],
        },
      }),
    ];
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
      await new DrizzleInbox(
        db,
        installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
        enqueueEventApplicationJob,
      ).transaction((tx) => tx.receive(deviceId, events, NOW));

      await vi.waitFor(
        async () => {
          const [sale] = await db.select().from(sales).where(eq(sales.id, saleId));
          expect(sale?.total).toBe(4800);
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(await db.select().from(salePayments)).toHaveLength(1);
      const received = await db.select().from(inbox).where(eq(inbox.deviceId, deviceId));
      expect(received.map((row) => row.appliedAt)).toEqual([NOW, NOW]);
    } finally {
      await recovery.close();
    }
  }, 60_000);
});
