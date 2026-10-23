import { randomUUID } from "node:crypto";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refusedEvents } from "../platform/db/schema.js";
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

const NOTHING_SET_ASIDE: ReadonlyMap<string, number> = new Map();

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

async function insertRefusedCopy(
  deviceId: string,
  eventId: string,
  deviceSeq: number,
): Promise<void> {
  await db.insert(refusedEvents).values({
    deviceId,
    eventId,
    deviceSeq,
    aggregateType: "Sale",
    aggregateId: randomUUID(),
    eventType: "sale_completed",
    schemaVersion: 2,
    payload: {},
    occurredAt: T0,
    actorId: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
    chainHmac: "hmac",
    refusedAt: T0,
  });
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
      NOTHING_SET_ASIDE,
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
      NOTHING_SET_ASIDE,
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
      NOTHING_SET_ASIDE,
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
      NOTHING_SET_ASIDE,
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
      NOTHING_SET_ASIDE,
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
      NOTHING_SET_ASIDE,
    );
    const acrossInstallations = await replenishment.ownEventsAbove(
      registerId,
      position,
      { deviceId: predecessor, deviceSeq: 2 },
      2,
      NOTHING_SET_ASIDE,
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

describe("the events a refused push left copies of", () => {
  it("reads the received sequences of each installation of the register a refused push left events of", async () => {
    const { registerId, predecessor, second } = await aRegisterRestoredTwice(db);
    const ofAnotherRegister = await insertInstallation(
      db,
      await insertRegister(db, await insertBranch(db)),
      { enrolledAt: T0 },
    );
    await insertInboxEvent(db, predecessor, { deviceSeq: 3, appliedAt: T0 });
    const refusedSecond = await insertInboxEvent(db, predecessor, { deviceSeq: 2 });
    await insertInboxEvent(db, predecessor, { deviceSeq: 1 });
    await insertRefusedCopy(predecessor, refusedSecond, 2);
    await insertRefusedCopy(predecessor, randomUUID(), 4);
    await insertEvents(second, [1]);
    await insertRefusedCopy(
      ofAnotherRegister,
      await insertInboxEvent(db, ofAnotherRegister, { deviceSeq: 1 }),
      1,
    );

    expect(await replenishment.receivedSeqsOfRefusedInstallations(registerId)).toEqual([
      { deviceId: predecessor, seqs: [1, 2, 3] },
    ]);
  });

  it("leaves out an event whose refused copy lies above the sequence given for its installation, an applied one included, serving those at or below it", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice(db);
    await insertInboxEvent(db, predecessor, { deviceSeq: 1 });
    const carriedAgain = await insertInboxEvent(db, predecessor, { deviceSeq: 2 });
    const applied = await insertInboxEvent(db, predecessor, { deviceSeq: 3, appliedAt: T0 });
    await insertRefusedCopy(predecessor, carriedAgain, 2);
    await insertRefusedCopy(predecessor, applied, 3);

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      100,
      new Map([[predecessor, 2]]),
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 1],
      [predecessor, 2],
    ]);
  });

  it("serves an event a refused push left a copy of when no sequence is given for its installation", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice(db);
    await insertInboxEvent(db, predecessor, { deviceSeq: 1 });
    await insertRefusedCopy(
      predecessor,
      await insertInboxEvent(db, predecessor, { deviceSeq: 3 }),
      3,
    );

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      100,
      NOTHING_SET_ASIDE,
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 1],
      [predecessor, 3],
    ]);
  });

  it("serves an event above the sequence given for its installation when the refused copy at its sequence is of another event", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice(db);
    await insertEvents(predecessor, [1, 2]);
    await insertRefusedCopy(predecessor, randomUUID(), 2);

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      100,
      new Map([[predecessor, 1]]),
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 1],
      [predecessor, 2],
    ]);
  });

  it("fills the limit with the events it serves, past the ones it leaves out", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice(db);
    await insertInboxEvent(db, predecessor, { deviceSeq: 1 });
    await insertRefusedCopy(
      predecessor,
      await insertInboxEvent(db, predecessor, { deviceSeq: 2, appliedAt: T0 }),
      2,
    );
    await insertInboxEvent(db, predecessor, { deviceSeq: 3 });

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      2,
      new Map([[predecessor, 1]]),
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 1],
      [predecessor, 3],
    ]);
  });
});
