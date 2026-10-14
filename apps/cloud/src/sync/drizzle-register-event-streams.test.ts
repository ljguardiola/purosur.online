import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceState } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRegisterEventStreams } from "./drizzle-register-event-streams.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

const NOW = new Date("2026-10-16T12:00:00.000Z");
const A_DAY_BEFORE = new Date("2026-10-15T12:00:00.000Z");
const APPLIED_AT = new Date("2026-10-16T11:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

describe("DrizzleRegisterEventStreams.installationsOf", () => {
  it("answers no installation for a register that never enrolled one", async () => {
    expect(
      await new DrizzleRegisterEventStreams(db).installationsOf(
        "00000000-0000-4000-8000-000000000000",
      ),
    ).toEqual([]);
  });

  it("answers an installation that never synced an event with no latest occurrence", async () => {
    const { registerId } = await insertEnrolledInstallation(db, { now: NOW });

    expect(await new DrizzleRegisterEventStreams(db).installationsOf(registerId)).toEqual([
      {
        enrolledAt: A_DAY_BEFORE,
        revokedAt: null,
        latestOccurredAt: null,
        caughtUpAt: null,
        holdsUnappliedEvents: false,
      },
    ]);
  });

  it("answers the latest moment an applied event of the installation occurred, whatever the order they arrived in", async () => {
    const { registerId, deviceId } = await insertEnrolledInstallation(db, { now: NOW });
    const latest = new Date("2026-10-16T05:00:00.000Z");
    for (const occurredAt of ["2026-10-15T20:00:00.000Z", latest, "2026-10-15T22:00:00.000Z"]) {
      await insertInboxEvent(db, deviceId, {
        occurredAt: new Date(occurredAt),
        appliedAt: APPLIED_AT,
      });
    }

    expect(await new DrizzleRegisterEventStreams(db).installationsOf(registerId)).toEqual([
      {
        enrolledAt: A_DAY_BEFORE,
        revokedAt: null,
        latestOccurredAt: latest,
        caughtUpAt: null,
        holdsUnappliedEvents: false,
      },
    ]);
  });

  it("leaves a received event not yet applied out of the latest occurrence and answers that the installation holds one", async () => {
    const { registerId, deviceId } = await insertEnrolledInstallation(db, { now: NOW });
    const applied = new Date("2026-10-15T20:00:00.000Z");
    await insertInboxEvent(db, deviceId, { occurredAt: applied, appliedAt: APPLIED_AT });
    await insertInboxEvent(db, deviceId, { occurredAt: new Date("2026-10-16T05:00:00.000Z") });

    expect(await new DrizzleRegisterEventStreams(db).installationsOf(registerId)).toEqual([
      {
        enrolledAt: A_DAY_BEFORE,
        revokedAt: null,
        latestOccurredAt: applied,
        caughtUpAt: null,
        holdsUnappliedEvents: true,
      },
    ]);
  });

  it("answers that an installation with a quarantined event holds one not applied", async () => {
    const { registerId, deviceId } = await insertEnrolledInstallation(db, { now: NOW });
    await insertInboxEvent(db, deviceId, {
      occurredAt: new Date("2026-10-16T05:00:00.000Z"),
      quarantinedAt: new Date("2026-10-16T06:00:00.000Z"),
    });

    expect(await new DrizzleRegisterEventStreams(db).installationsOf(registerId)).toEqual([
      {
        enrolledAt: A_DAY_BEFORE,
        revokedAt: null,
        latestOccurredAt: null,
        caughtUpAt: null,
        holdsUnappliedEvents: true,
      },
    ]);
  });

  it("answers the moment the installation was last caught up", async () => {
    const { registerId, deviceId } = await insertEnrolledInstallation(db, { now: NOW });
    const caughtUpAt = new Date("2026-10-16T08:00:00.000Z");
    await db.insert(deviceState).values({ deviceId, caughtUpAt });

    expect(await new DrizzleRegisterEventStreams(db).installationsOf(registerId)).toEqual([
      {
        enrolledAt: A_DAY_BEFORE,
        revokedAt: null,
        latestOccurredAt: null,
        caughtUpAt,
        holdsUnappliedEvents: false,
      },
    ]);
  });

  it("answers every installation of the register, revoked ones included, each with its own applied events", async () => {
    const revokedAt = new Date("2026-10-15T18:00:00.000Z");
    const revoked = await insertEnrolledInstallation(db, { now: NOW, revokedAt });
    const active = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: revoked.registerId,
    });
    const revokedLatest = new Date("2026-10-15T17:00:00.000Z");
    const activeLatest = new Date("2026-10-16T09:00:00.000Z");
    await insertInboxEvent(db, revoked.deviceId, {
      occurredAt: revokedLatest,
      appliedAt: APPLIED_AT,
    });
    await insertInboxEvent(db, active.deviceId, {
      occurredAt: activeLatest,
      appliedAt: APPLIED_AT,
    });

    const installations = await new DrizzleRegisterEventStreams(db).installationsOf(
      revoked.registerId,
    );

    expect(installations).toHaveLength(2);
    expect(installations).toEqual(
      expect.arrayContaining([
        {
          enrolledAt: A_DAY_BEFORE,
          revokedAt,
          latestOccurredAt: revokedLatest,
          caughtUpAt: null,
          holdsUnappliedEvents: false,
        },
        {
          enrolledAt: A_DAY_BEFORE,
          revokedAt: null,
          latestOccurredAt: activeLatest,
          caughtUpAt: null,
          holdsUnappliedEvents: false,
        },
      ]),
    );
  });

  it("leaves out the installations of other registers", async () => {
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const { registerId } = await insertEnrolledInstallation(db, { now: NOW });
    await insertInboxEvent(db, other.deviceId);

    expect(await new DrizzleRegisterEventStreams(db).installationsOf(registerId)).toEqual([
      {
        enrolledAt: A_DAY_BEFORE,
        revokedAt: null,
        latestOccurredAt: null,
        caughtUpAt: null,
        holdsUnappliedEvents: false,
      },
    ]);
  });
});
