import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { alerts, clockCorrections, users } from "../platform/db/schema.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { aClockCorrectedFact } from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();
const CORRECTED_AT = "2026-10-05T12:00:00.000Z";

async function record(
  fact: Extract<SyncedFact, { kind: "clock_corrected" }>,
  deviceId: string,
  eventId = randomUUID(),
) {
  const event = unappliedEventOf(
    {
      event_id: eventId,
      device_seq: 3,
      aggregate_type: "CashRegister",
      aggregate_id: fact.correction.registerId,
      event_type: "clock_corrected",
      schema_version: 1,
      payload: {},
      occurred_at: CORRECTED_AT,
      actor_id: fact.correction.actorId,
      chain_hmac: "hmac",
    },
    { deviceId },
  );
  await system.application.transaction((tx) => tx.record(fact, event));
  return eventId;
}

async function enrolledWithActor() {
  const { deviceId, registerId, locationId } = await system.enrollInstallation();
  const [actor] = await system.db
    .insert(users)
    .values({ firstName: "Ada", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return { deviceId, registerId, locationId, actorId: actor.id };
}

describe("recording the correction of a register's clock", () => {
  it("keeps the correction with the register, the readings, the person and the event that reported it", async () => {
    const { deviceId, registerId, actorId } = await enrolledWithActor();
    const fact = aClockCorrectedFact({ registerId, actorId });

    const eventId = await record(fact, deviceId);

    const [alert] = await system.db.select().from(alerts);
    expect(await system.db.select().from(clockCorrections)).toEqual([
      {
        eventId,
        registerId,
        pointOfSale: 7,
        documentType: "factura_c",
        previousReading: new Date("2026-10-07T12:00:00.000Z"),
        previousReadingSource: "clock_mark",
        correctedReading: new Date("2026-10-05T12:00:00.000Z"),
        actorId,
        correctedAt: new Date(CORRECTED_AT),
        alertId: alert?.id,
        recordedAt: new Date("2026-10-06T15:00:00.000Z"),
      },
    ]);
  });

  it("opens a critical clock_corrected alert of the register for every location, naming what was corrected", async () => {
    const { deviceId, registerId, actorId } = await enrolledWithActor();

    await record(aClockCorrectedFact({ registerId, actorId }), deviceId);

    expect(await system.db.select().from(alerts)).toEqual([
      expect.objectContaining({
        kind: "clock_corrected",
        scope: registerId,
        level: "critical",
        audience: "all",
        locationId: null,
        resolvedAt: null,
        deduplicates: false,
        detail: {
          pointOfSale: 7,
          documentType: "factura_c",
          previousReading: "2026-10-07T12:00:00.000Z",
          previousReadingSource: "clock_mark",
          correctedReading: "2026-10-05T12:00:00.000Z",
          actorId,
        },
      }),
    ]);
  });

  it("keeps, in the correction and in its alert, that the previous reading is the start of the tax authority's day", async () => {
    const { deviceId, registerId, actorId } = await enrolledWithActor();
    const fact = aClockCorrectedFact({
      registerId,
      actorId,
      previousReadingSource: "tax_authority_day",
    });

    await record(fact, deviceId);

    expect(await system.db.select().from(clockCorrections)).toEqual([
      expect.objectContaining({ previousReadingSource: "tax_authority_day" }),
    ]);
    expect(await system.db.select().from(alerts)).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({ previousReadingSource: "tax_authority_day" }),
      }),
    ]);
  });

  it("changes nothing when the same event is recorded again", async () => {
    const { deviceId, registerId, actorId } = await enrolledWithActor();
    const fact = aClockCorrectedFact({ registerId, actorId });
    const eventId = await record(fact, deviceId);

    await record(fact, deviceId, eventId);

    expect(await system.db.select().from(clockCorrections)).toHaveLength(1);
    expect(await system.db.select().from(alerts)).toHaveLength(1);
  });

  it("opens an alert for every correction, since each leaves documents to regularize", async () => {
    const { deviceId, registerId, actorId } = await enrolledWithActor();

    await record(aClockCorrectedFact({ registerId, actorId }), deviceId);
    await record(aClockCorrectedFact({ registerId, actorId, pointOfSale: 9 }), deviceId);

    expect(await system.db.select().from(clockCorrections)).toHaveLength(2);
    expect(await system.db.select().from(alerts)).toHaveLength(2);
  });

  it("refuses a correction naming a register other than the one that pushed it", async () => {
    const { deviceId, actorId } = await enrolledWithActor();

    await expect(
      record(aClockCorrectedFact({ registerId: randomUUID(), actorId }), deviceId),
    ).rejects.toThrow(/names register .*, not the register .* that pushed it/);

    expect(await system.db.select().from(clockCorrections)).toEqual([]);
    expect(await system.db.select().from(alerts)).toEqual([]);
  });
});
