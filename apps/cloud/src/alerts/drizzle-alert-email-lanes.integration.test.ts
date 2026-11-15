import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleAlertEmailLanes } from "./drizzle-alert-email-lanes.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_email_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function seedPendingDelivery(): Promise<string> {
  const [location] = await sql<{ id: string }[]>`select id from locations limit 1`;
  const [user] = await sql<{ id: string }[]>`
    insert into users (first_name, email, location_id)
    values ('Ada', ${`ada-${crypto.randomUUID()}@example.com`}, ${location?.id ?? null})
    returning id`;
  const [alert] = await sql<{ id: string }[]>`
    insert into alerts (kind, scope, level, audience, detail)
    values ('backoffice_passkey_changed', ${crypto.randomUUID()}, 'warning', 'all', '{}')
    returning id`;
  const [delivery] = await sql<{ id: string }[]>`
    insert into alert_email_deliveries (alert_id, recipient_user_id, stage, level, occurred_at)
    values (${alert?.id ?? null}, ${user?.id ?? null}, 'opened', 'warning', now())
    returning id`;
  if (!delivery) {
    throw new Error("test setup: no delivery was seeded");
  }
  return delivery.id;
}

describe("the alert email lanes on a real Postgres", () => {
  it("lets one run at a time, a second one ending at once, without its work, while the first holds the lane", async () => {
    const lanes = new DrizzleAlertEmailLanes(postgresDedicatedConnections(sql));
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => {};
    const firstEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = lanes.inAlertEmailLane(async () => {
      entered();
      await held;
      return "first";
    });
    await firstEntered;
    let secondRan = false;

    const second = await lanes.inAlertEmailLane(async () => {
      secondRan = true;
    });
    release();

    expect(second).toEqual({ kind: "busy" });
    expect(secondRan).toBe(false);
    await expect(first).resolves.toEqual({ kind: "ran", result: "first" });
    await expect(lanes.inAlertEmailLane(async () => "after")).resolves.toEqual({
      kind: "ran",
      result: "after",
    });
  });

  it("commits each write as it is made, visible to other connections while the lane is still held", async () => {
    const deliveryId = await seedPendingDelivery();
    const lanes = new DrizzleAlertEmailLanes(postgresDedicatedConnections(sql));

    const seenWhileHeld = await lanes.inAlertEmailLane(async (store) => {
      await store.recordEmailAttempt(deliveryId, {
        attempt: 1,
        nextAttemptAt: new Date("2026-10-01T12:01:00.000Z"),
      });
      const [row] = await sql<{ attempts: number }[]>`
        select attempts from alert_email_deliveries where id = ${deliveryId}`;
      return row?.attempts;
    });

    expect(seenWhileHeld).toEqual({ kind: "ran", result: 1 });
  });

  it("releases the lane when the work fails, so the next run goes ahead", async () => {
    const lanes = new DrizzleAlertEmailLanes(postgresDedicatedConnections(sql));

    await expect(
      lanes.inAlertEmailLane(async () => {
        throw new Error("the run failed");
      }),
    ).rejects.toThrow("the run failed");

    await expect(lanes.inAlertEmailLane(async () => "next run")).resolves.toEqual({
      kind: "ran",
      result: "next run",
    });
  });
});
