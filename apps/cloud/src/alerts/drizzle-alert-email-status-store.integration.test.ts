import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleAlertEmailLanes } from "./drizzle-alert-email-lanes.js";
import { DrizzleAlertEmailStatusStore } from "./drizzle-alert-email-status-store.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_email_status_store");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function seedDeliveryWaitingForItsRetry(): Promise<void> {
  const [location] = await sql<{ id: string }[]>`select id from locations limit 1`;
  const [user] = await sql<{ id: string }[]>`
    insert into users (first_name, email, location_id)
    values ('Ada', ${`ada-${crypto.randomUUID()}@example.com`}, ${location?.id ?? null})
    returning id`;
  const [alert] = await sql<{ id: string }[]>`
    insert into alerts (kind, scope, level, audience, detail)
    values ('backoffice_passkey_changed', ${crypto.randomUUID()}, 'warning', 'all', '{}')
    returning id`;
  await sql`
    insert into alert_email_deliveries
      (alert_id, recipient_user_id, stage, level, occurred_at, attempts, next_attempt_at, error)
    values
      (${alert?.id ?? null}, ${user?.id ?? null}, 'opened', 'warning', now(), 1,
       now() + interval '1 minute', 'provider_unavailable')`;
}

async function withAnotherSessionHolding<T>(
  lock: (session: postgres.ReservedSql) => Promise<unknown>,
  work: () => Promise<T>,
): Promise<T> {
  const session = await sql.reserve();
  try {
    await lock(session);
    return await work();
  } finally {
    await session`select pg_advisory_unlock_all()`;
    session.release();
  }
}

describe("DrizzleAlertEmailStatusStore isAlertEmailSendRunning on a real Postgres", () => {
  const store = () => new DrizzleAlertEmailStatusStore(drizzle(sql));

  it("tells an alert email send is running while a run holds the alert email lane", async () => {
    const lanes = new DrizzleAlertEmailLanes(postgresDedicatedConnections(sql));

    const seen = await lanes.inAlertEmailLane(() => store().isAlertEmailSendRunning());

    expect(seen).toEqual({ kind: "ran", result: true });
  });

  it("tells no alert email send is running once the run has left the lane", async () => {
    const lanes = new DrizzleAlertEmailLanes(postgresDedicatedConnections(sql));
    await lanes.inAlertEmailLane(async () => undefined);

    await expect(store().isAlertEmailSendRunning()).resolves.toBe(false);
  });

  it("tells no alert email send is running while deliveries only wait for their retry", async () => {
    await seedDeliveryWaitingForItsRetry();

    await expect(store().isAlertEmailSendRunning()).resolves.toBe(false);
  });

  it("tells no alert email send is running while another session holds another lock", async () => {
    await expect(
      withAnotherSessionHolding(
        (session) => session`select pg_advisory_lock(hashtextextended('another_lane', 0))`,
        () => store().isAlertEmailSendRunning(),
      ),
    ).resolves.toBe(false);
  });

  it("tells no alert email send is running while another session holds the lane's halves as a pair of keys", async () => {
    await expect(
      withAnotherSessionHolding(
        (session) => session`
          select pg_advisory_lock(
            (hashtextextended('alert_email_delivery', 0) >> 32)::int,
            (hashtextextended('alert_email_delivery', 0) << 32 >> 32)::int)`,
        () => store().isAlertEmailSendRunning(),
      ),
    ).resolves.toBe(false);
  });

  it("tells no alert email send is running while a run holds the alert email lane of another database", async () => {
    const otherDb = await createIntegrationDatabase("alert_email_status_store_other");
    const otherSql = postgres(otherDb.databaseUrl, { max: 2 });
    try {
      const otherLanes = new DrizzleAlertEmailLanes(postgresDedicatedConnections(otherSql));

      const seen = await otherLanes.inAlertEmailLane(() => store().isAlertEmailSendRunning());

      expect(seen).toEqual({ kind: "ran", result: false });
    } finally {
      await otherSql.end({ timeout: 1 });
      await otherDb.close();
    }
  }, 60_000);
});
