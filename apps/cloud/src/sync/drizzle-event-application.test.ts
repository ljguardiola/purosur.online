import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { alerts, inbox } from "../platform/db/schema.js";
import {
  APPLICATION_NOW,
  eventApplicationUnderTest,
} from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

const system = eventApplicationUnderTest();

const sale = (aggregateId: string) => ({ aggregateType: "Sale", aggregateId });
const session = (aggregateId: string) => ({ aggregateType: "CashSession", aggregateId });

describe("the aggregates with events waiting to be applied", () => {
  it("lists each aggregate once, the one whose earliest event arrived first leading", async () => {
    const { deviceId } = await system.enrollInstallation();
    const later = randomUUID();
    const earlier = randomUUID();
    await insertInboxEvent(system.db, deviceId, {
      ...sale(later),
      receivedAt: new Date("2026-10-06T11:00:10.000Z"),
    });
    await insertInboxEvent(system.db, deviceId, {
      ...session(earlier),
      receivedAt: new Date("2026-10-06T11:00:05.000Z"),
    });
    await insertInboxEvent(system.db, deviceId, {
      ...sale(later),
      receivedAt: new Date("2026-10-06T11:00:20.000Z"),
    });

    expect(await system.application.pendingAggregates()).toEqual([
      { aggregateType: "CashSession", aggregateId: earlier },
      { aggregateType: "Sale", aggregateId: later },
    ]);
  });

  it("leaves out an aggregate whose events are all applied or quarantined", async () => {
    const { deviceId } = await system.enrollInstallation();
    await insertInboxEvent(system.db, deviceId, { appliedAt: APPLICATION_NOW });
    await insertInboxEvent(system.db, deviceId, { quarantinedAt: APPLICATION_NOW });
    const waiting = randomUUID();
    await insertInboxEvent(system.db, deviceId, sale(waiting));

    expect(await system.application.pendingAggregates()).toEqual([
      { aggregateType: "Sale", aggregateId: waiting },
    ]);
  });
});

describe("the events of one aggregate that are not applied yet", () => {
  it("holds every unapplied event of the aggregate, quarantined or waiting to retry, and no other", async () => {
    const { deviceId } = await system.enrollInstallation();
    const aggregateId = randomUUID();
    const quarantinedAt = new Date("2026-10-06T14:00:00.000Z");
    const nextAttemptAt = new Date("2026-10-06T15:05:00.000Z");
    const quarantined = await insertInboxEvent(system.db, deviceId, {
      ...sale(aggregateId),
      eventType: "sale_completed",
      schemaVersion: 1,
      payload: { id: "a-sale" },
      attempts: 5,
      quarantinedAt,
    });
    const retrying = await insertInboxEvent(system.db, deviceId, {
      ...sale(aggregateId),
      eventType: "fiscal_gate_failed",
      schemaVersion: 1,
      attempts: 2,
      nextAttemptAt,
    });
    await insertInboxEvent(system.db, deviceId, {
      ...sale(aggregateId),
      appliedAt: APPLICATION_NOW,
    });
    await insertInboxEvent(system.db, deviceId, sale(randomUUID()));

    const unapplied = await system.application.transaction((tx) =>
      tx.unappliedEventsOf({ aggregateType: "Sale", aggregateId }),
    );

    expect(unapplied.map((event) => event.eventId).sort()).toEqual([quarantined, retrying].sort());
    expect(unapplied.find((event) => event.eventId === quarantined)).toMatchObject({
      deviceId,
      aggregateType: "Sale",
      aggregateId,
      eventType: "sale_completed",
      schemaVersion: 1,
      payload: { id: "a-sale" },
      actorId: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      attempts: 5,
      quarantinedAt,
      nextAttemptAt: null,
      occurredAt: new Date("2026-10-06T11:00:00.000Z"),
      receivedAt: new Date("2026-10-06T11:00:05.000Z"),
    });
    expect(unapplied.find((event) => event.eventId === retrying)).toMatchObject({
      attempts: 2,
      quarantinedAt: null,
      nextAttemptAt,
    });
  });
});

describe("whether an aggregate has been applied", () => {
  it("is true once an event of that aggregate was applied", async () => {
    const { deviceId } = await system.enrollInstallation();
    const aggregateId = randomUUID();
    await insertInboxEvent(system.db, deviceId, {
      ...session(aggregateId),
      appliedAt: APPLICATION_NOW,
    });

    const applied = await system.application.transaction((tx) =>
      tx.aggregateApplied({ aggregateType: "CashSession", aggregateId }),
    );

    expect(applied).toBe(true);
  });

  it("is false while its events are not applied, and for an aggregate of another type", async () => {
    const { deviceId } = await system.enrollInstallation();
    const aggregateId = randomUUID();
    await insertInboxEvent(system.db, deviceId, session(aggregateId));
    await insertInboxEvent(system.db, deviceId, {
      ...sale(aggregateId),
      appliedAt: APPLICATION_NOW,
    });

    const applied = await system.application.transaction((tx) =>
      tx.aggregateApplied({ aggregateType: "CashSession", aggregateId }),
    );

    expect(applied).toBe(false);
  });
});

describe("recording what happened to an event", () => {
  it("marks it applied at the instant it is given", async () => {
    const { deviceId } = await system.enrollInstallation();
    const eventId = await insertInboxEvent(system.db, deviceId);

    await system.application.transaction((tx) => tx.markApplied(eventId, APPLICATION_NOW));

    const [row] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(row?.appliedAt).toEqual(APPLICATION_NOW);
  });

  it("keeps a failed attempt's count, next try, quarantine and error", async () => {
    const { deviceId } = await system.enrollInstallation();
    const retried = await insertInboxEvent(system.db, deviceId);
    const quarantined = await insertInboxEvent(system.db, deviceId);
    const nextAttemptAt = new Date("2026-10-06T15:02:00.000Z");

    await system.application.transaction(async (tx) => {
      await tx.recordFailedAttempt(retried, {
        attempts: 1,
        nextAttemptAt,
        quarantinedAt: null,
        error: "depends on CashSession 1 not applied yet",
      });
      await tx.recordFailedAttempt(quarantined, {
        attempts: 5,
        nextAttemptAt: null,
        quarantinedAt: APPLICATION_NOW,
        error: "no schema reads sale_completed version 3",
      });
    });

    const rows = await system.db.select().from(inbox);
    expect(rows.find((row) => row.eventId === retried)).toMatchObject({
      attempts: 1,
      nextAttemptAt,
      quarantinedAt: null,
      lastError: "depends on CashSession 1 not applied yet",
      appliedAt: null,
    });
    expect(rows.find((row) => row.eventId === quarantined)).toMatchObject({
      attempts: 5,
      nextAttemptAt: null,
      quarantinedAt: APPLICATION_NOW,
      lastError: "no schema reads sale_completed version 3",
    });
  });

  it("leaves nothing behind when the transaction fails", async () => {
    const { deviceId } = await system.enrollInstallation();
    const eventId = await insertInboxEvent(system.db, deviceId);

    await expect(
      system.application.transaction(async (tx) => {
        await tx.markApplied(eventId, APPLICATION_NOW);
        throw new Error("the operation failed");
      }),
    ).rejects.toThrow("the operation failed");

    const [row] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(row?.appliedAt).toBeNull();
  });
});

describe("locking an aggregate", () => {
  it("can be taken for several aggregates in one transaction", async () => {
    await expect(
      system.application.transaction(async (tx) => {
        await tx.lockAggregate({ aggregateType: "Sale", aggregateId: "a" });
        await tx.lockAggregate({ aggregateType: "CashSession", aggregateId: "a" });
      }),
    ).resolves.toBeUndefined();
  });
});

describe("opening the alerts of the events that were not applied normally", () => {
  it("opens one alert for the installation whose event was quarantined", async () => {
    const { deviceId } = await system.enrollInstallation();
    const eventId = randomUUID();
    const aggregateId = randomUUID();

    await system.application.transaction((tx) =>
      tx.openQuarantineAlert({
        deviceId,
        eventId,
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId,
        error: "no schema reads sale_completed version 3",
      }),
    );

    const rows = await system.db.select().from(alerts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "events_quarantined",
      scope: deviceId,
      openedAt: APPLICATION_NOW,
      detail: {
        deviceId,
        eventId,
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId,
        error: "no schema reads sale_completed version 3",
      },
    });
  });

  it("opens one alert for the event that broke an invariant", async () => {
    const eventId = randomUUID();
    const aggregateId = randomUUID();

    await system.application.transaction((tx) =>
      tx.openInvariantAlert({
        eventId,
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId,
        breaks: ["approved_payments_below_total"],
      }),
    );

    const rows = await system.db.select().from(alerts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "event_invariant_violated",
      scope: eventId,
      openedAt: APPLICATION_NOW,
      detail: {
        eventId,
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId,
        breaks: ["approved_payments_below_total"],
      },
    });
  });
});
