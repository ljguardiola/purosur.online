import { describe, expect, it } from "vitest";
import {
  registerContingencyIntervals,
  registerContingencyReporting,
} from "../platform/db/schema.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";

const system = eventApplicationUnderTest();
const { record } = system;

const INTERVAL = "01a1414f-0002-7c2d-9e3f-5a6b7c8d9e02";
const STARTED = new Date("2026-10-06T11:00:00.000Z");
const ENDED = new Date("2026-10-06T11:40:00.000Z");

describe("recording a register's contingency from applied events", () => {
  it("keeps the interval a register entered and left at the register that sent the events", async () => {
    const { deviceId, registerId } = await system.enrollInstallation();

    await record(
      { kind: "contingency_entered", interval: { intervalId: INTERVAL, startedAt: STARTED } },
      { deviceId, aggregateType: "Register", aggregateId: registerId },
    );
    await record(
      {
        kind: "contingency_left",
        interval: { intervalId: INTERVAL, startedAt: STARTED, endedAt: ENDED },
      },
      { deviceId, aggregateType: "Register", aggregateId: registerId },
    );

    expect(await system.db.select().from(registerContingencyIntervals)).toEqual([
      { intervalId: INTERVAL, registerId, startedAt: STARTED, endedAt: ENDED },
    ]);
  });

  it("keeps the moment the register started reporting its contingency", async () => {
    const { deviceId, registerId } = await system.enrollInstallation();

    await record(
      {
        kind: "contingency_reporting_started",
        reporting: { since: STARTED, fromEnrollment: false },
      },
      { deviceId, aggregateType: "Register", aggregateId: registerId },
    );

    expect(await system.db.select().from(registerContingencyReporting)).toEqual([
      { registerId, since: STARTED },
    ]);
  });

  it("keeps the moment the installation was enrolled as the start of a register that reported from its enrollment", async () => {
    const enrolledAt = new Date("2026-10-06T10:59:55.000Z");
    const { deviceId, registerId } = await system.enrollInstallation({ enrolledAt });

    await record(
      {
        kind: "contingency_reporting_started",
        reporting: { since: STARTED, fromEnrollment: true },
      },
      { deviceId, aggregateType: "Register", aggregateId: registerId },
    );

    expect(await system.db.select().from(registerContingencyReporting)).toEqual([
      { registerId, since: enrolledAt },
    ]);
  });

  it("keeps the enrollment of the installation that reported, not that of the register's later replacement", async () => {
    const originalEnrolledAt = new Date("2026-10-06T10:59:55.000Z");
    const original = await system.enrollInstallation({
      enrolledAt: originalEnrolledAt,
      revokedAt: new Date("2026-10-08T09:00:00.000Z"),
    });
    await system.enrollInstallation({
      existingRegisterId: original.registerId,
      enrolledAt: new Date("2026-10-08T10:00:00.000Z"),
    });

    await record(
      {
        kind: "contingency_reporting_started",
        reporting: { since: STARTED, fromEnrollment: true },
      },
      {
        deviceId: original.deviceId,
        aggregateType: "Register",
        aggregateId: original.registerId,
      },
    );

    expect(await system.db.select().from(registerContingencyReporting)).toEqual([
      { registerId: original.registerId, since: originalEnrolledAt },
    ]);
  });
});
