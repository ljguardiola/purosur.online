import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aRegisterRestoredTwice,
  hoursAfter,
  insertBranch,
  insertInstallation,
  insertRegister,
  T0,
} from "../register/test-support/restored-register-installations.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRegisterReplenishment } from "./drizzle-register-replenishment.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let replenishment: DrizzleRegisterReplenishment<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_replenishment");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  replenishment = new DrizzleRegisterReplenishment(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function insertEvents(deviceId: string, seqs: number[]): Promise<void> {
  for (const deviceSeq of seqs) {
    await insertInboxEvent(db, deviceId, { deviceSeq });
  }
}

function positionsOf(events: { deviceId: string; event: { device_seq: number } }[]) {
  return events.map(({ deviceId, event }) => [deviceId, event.device_seq]);
}

describe("the events of a register above a predecessor position", () => {
  it("holds the predecessor's events above the last acknowledged sequence, whatever their state", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice(db);
    await insertEvents(predecessor, [1, 2, 3]);
    await insertInboxEvent(db, predecessor, { deviceSeq: 4, appliedAt: T0 });
    await insertInboxEvent(db, predecessor, {
      deviceSeq: 5,
      quarantinedAt: T0,
      lastError: "invalid payload",
    });

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 3 },
      undefined,
      100,
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 4],
      [predecessor, 5],
    ]);
  });

  it("holds every event of the installations enrolled after the predecessor, in enrollment order and then sequence", async () => {
    const { registerId, predecessor, second, third } = await aRegisterRestoredTwice(db);
    await insertEvents(predecessor, [1, 2]);
    await insertEvents(third, [2, 1]);
    await insertEvents(second, [3, 1]);

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 1 },
      undefined,
      100,
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 2],
      [second, 1],
      [second, 3],
      [third, 1],
      [third, 2],
    ]);
  });

  it("leaves out the events of installations enrolled before the predecessor and of other registers", async () => {
    const { registerId, predecessor, second } = await aRegisterRestoredTwice(db);
    const earlier = await insertInstallation(db, registerId, {
      enrolledAt: hoursAfter(T0, -3),
      revokedAt: hoursAfter(T0, -2),
    });
    const otherRegisterId = await insertRegister(db, await insertBranch(db));
    const ofAnotherRegister = await insertInstallation(db, otherRegisterId, {
      enrolledAt: hoursAfter(T0, 3),
    });
    await insertEvents(earlier, [1]);
    await insertEvents(ofAnotherRegister, [1]);
    await insertEvents(second, [1]);

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      100,
    );

    expect(positionsOf(events)).toEqual([[second, 1]]);
  });

  it("carries each event as the register pushed it", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice(db);
    const eventId = await insertInboxEvent(db, predecessor, {
      deviceSeq: 1,
      aggregateType: "sale",
      aggregateId: "sale-1",
      eventType: "sale_line_added",
      schemaVersion: 3,
      payload: { quantity: 2, note: null },
      occurredAt: new Date("2026-10-01T09:00:00.000Z"),
      actorId: "user-1",
      chainHmac: "chain",
    });

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      100,
    );

    expect(events).toEqual([
      {
        deviceId: predecessor,
        event: {
          event_id: eventId,
          device_seq: 1,
          aggregate_type: "sale",
          aggregate_id: "sale-1",
          event_type: "sale_line_added",
          schema_version: 3,
          payload: { quantity: 2, note: null },
          occurred_at: "2026-10-01T09:00:00.000Z",
          actor_id: "user-1",
          chain_hmac: "chain",
        },
      },
    ]);
  });

  it("holds no more events than the limit", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice(db);
    await insertEvents(predecessor, [1, 2, 3]);

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      2,
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 1],
      [predecessor, 2],
    ]);
  });

  it("continues strictly after an event, across installations", async () => {
    const { registerId, predecessor, second, third } = await aRegisterRestoredTwice(db);
    await insertEvents(predecessor, [1, 2]);
    await insertEvents(second, [1, 2]);
    await insertEvents(third, [1]);
    const position = { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 };

    const withinInstallation = await replenishment.ownEventsAbove(
      registerId,
      position,
      { deviceId: second, deviceSeq: 1 },
      100,
    );
    const acrossInstallations = await replenishment.ownEventsAbove(
      registerId,
      position,
      { deviceId: predecessor, deviceSeq: 2 },
      2,
    );

    expect(positionsOf(withinInstallation)).toEqual([
      [second, 2],
      [third, 1],
    ]);
    expect(positionsOf(acrossInstallations)).toEqual([
      [second, 1],
      [second, 2],
    ]);
  });
});
