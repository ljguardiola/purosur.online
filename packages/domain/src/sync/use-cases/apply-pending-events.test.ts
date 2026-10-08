import { describe, expect, it } from "vitest";
import {
  A_CASH_MOVEMENT_FACT,
  A_SESSION_OPENED_FACT,
  aCompletedSaleFact,
} from "../model/test-support/synced-facts.js";
import { applyPendingEvents } from "./apply-pending-events.js";
import {
  aStoredEvent,
  FakeEventApplication,
  FakeEventUpcaster,
  type FakeStoredEvent,
} from "./test-support/fake-event-application.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");

function run(
  eventApplication: FakeEventApplication,
  upcaster: FakeEventUpcaster,
  options: { limit?: number; now?: Date } = {},
) {
  return applyPendingEvents(
    { eventApplication, upcaster, clock: { now: () => options.now ?? NOW } },
    { limit: options.limit ?? 100 },
  );
}

const sessionEvent = (
  eventId: string,
  deviceSeq: number,
  overrides: Partial<FakeStoredEvent> = {},
) =>
  aStoredEvent({
    eventId,
    deviceSeq,
    aggregateType: "CashSession",
    aggregateId: "session-1",
    eventType: "cash_movement_recorded",
    schemaVersion: 1,
    ...overrides,
  });

const openedEvent = (overrides: Partial<FakeStoredEvent> = {}) =>
  sessionEvent("opened", 1, { eventType: "cash_session_opened", ...overrides });

const saleEvent = (overrides: Partial<FakeStoredEvent> = {}) =>
  aStoredEvent({ eventId: "sale-event", ...overrides });

function appliedSessionOpening(): FakeStoredEvent {
  return openedEvent({ appliedAt: new Date("2026-10-07T09:00:00.000Z") });
}

describe("applying the events the cloud holds", () => {
  it("does nothing when no event is waiting", async () => {
    const application = new FakeEventApplication();

    const outcome = await run(application, new FakeEventUpcaster({}));

    expect(outcome).toEqual({ kind: "idle" });
    expect(application.transactions).toBe(0);
  });

  it("applies the events of an aggregate in the order they were created, one transaction each", async () => {
    const application = new FakeEventApplication([
      sessionEvent("third", 3),
      openedEvent(),
      sessionEvent("second", 2),
    ]);
    const upcaster = new FakeEventUpcaster({
      opened: A_SESSION_OPENED_FACT,
      second: A_CASH_MOVEMENT_FACT,
      third: A_CASH_MOVEMENT_FACT,
    });

    const outcome = await run(application, upcaster);

    expect(application.appliedEventIds).toEqual(["opened", "second", "third"]);
    expect(application.state.recorded.map((one) => one.eventId)).toEqual([
      "opened",
      "second",
      "third",
    ]);
    expect(outcome).toEqual({
      kind: "processed",
      applied: 3,
      flagged: 0,
      retried: 0,
      quarantined: 0,
      busy: 0,
      limitReached: false,
    });
  });

  it("applies events of different installations in the order they happened", async () => {
    const application = new FakeEventApplication([
      sessionEvent("from-device-2", 1, {
        deviceId: "device-2",
        occurredAt: new Date("2026-10-07T10:00:00.000Z"),
      }),
      sessionEvent("from-device-1", 1, {
        deviceId: "device-1",
        occurredAt: new Date("2026-10-07T10:00:01.000Z"),
      }),
    ]);
    const upcaster = new FakeEventUpcaster({
      "from-device-1": A_CASH_MOVEMENT_FACT,
      "from-device-2": A_CASH_MOVEMENT_FACT,
    });

    await run(application, upcaster);

    expect(application.state.recorded.map((one) => one.eventId)).toEqual([
      "from-device-2",
      "from-device-1",
    ]);
  });

  it("takes the aggregate's lock before reading its events, in every transaction", async () => {
    const application = new FakeEventApplication([openedEvent()]);

    await run(application, new FakeEventUpcaster({ opened: A_SESSION_OPENED_FACT }));

    expect(application.calls).toEqual([
      "begin",
      "lock CashSession/session-1",
      "read CashSession/session-1",
      "commit",
      "begin",
      "lock CashSession/session-1",
      "read CashSession/session-1",
      "commit",
    ]);
  });

  it("stamps the event as applied at the time it applied it", async () => {
    const application = new FakeEventApplication([openedEvent()]);

    await run(application, new FakeEventUpcaster({ opened: A_SESSION_OPENED_FACT }));

    expect(application.event("opened").appliedAt).toEqual(NOW);
  });

  it("stops after the number of events it was allowed and says so", async () => {
    const application = new FakeEventApplication([
      openedEvent(),
      aStoredEvent({ eventId: "other-1", aggregateId: "sale-2" }),
      aStoredEvent({ eventId: "other-2", aggregateId: "sale-3" }),
    ]);
    const upcaster = new FakeEventUpcaster({
      opened: A_SESSION_OPENED_FACT,
      "other-1": A_SESSION_OPENED_FACT,
      "other-2": A_SESSION_OPENED_FACT,
    });

    const outcome = await run(application, upcaster, { limit: 2 });

    expect(application.appliedEventIds).toEqual(["opened", "other-1"]);
    expect(outcome).toMatchObject({ kind: "processed", applied: 2, limitReached: true });
  });

  it("says it stopped at its allowance only when it used the whole allowance", async () => {
    const application = new FakeEventApplication([openedEvent()]);

    const outcome = await run(
      application,
      new FakeEventUpcaster({ opened: A_SESSION_OPENED_FACT }),
      {
        limit: 2,
      },
    );

    expect(outcome).toMatchObject({ applied: 1, limitReached: false });
  });

  it("counts a failed attempt against the allowance", async () => {
    const application = new FakeEventApplication([
      saleEvent({ eventId: "unreadable" }),
      saleEvent({ eventId: "other", aggregateId: "sale-2" }),
    ]);

    const outcome = await run(application, new FakeEventUpcaster({}), { limit: 1 });

    expect(outcome).toMatchObject({ retried: 1, limitReached: true });
    expect(application.event("other").attempts).toBe(0);
  });
});

describe("an event that cannot be applied yet", () => {
  it("fails on its dependency when the cash session was not applied, and is tried again later", async () => {
    const application = new FakeEventApplication([saleEvent()]);
    const upcaster = new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() });

    const outcome = await run(application, upcaster);

    expect(application.event("sale-event")).toMatchObject({
      appliedAt: null,
      attempts: 1,
      nextAttemptAt: new Date("2026-10-07T12:00:30.000Z"),
      quarantinedAt: null,
      error: "depends on CashSession session-1 not applied yet",
    });
    expect(application.state.recorded).toEqual([]);
    expect(application.state.quarantineAlerts).toEqual([]);
    expect(outcome).toMatchObject({ applied: 0, retried: 1, quarantined: 0 });
  });

  it("is applied once the cash session it depends on is applied", async () => {
    const application = new FakeEventApplication([saleEvent(), appliedSessionOpening()]);
    const upcaster = new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() });

    await run(application, upcaster);

    expect(application.event("sale-event").appliedAt).toEqual(NOW);
  });

  it("is applied on a later run once the cash session is applied, when its retry time has come", async () => {
    const application = new FakeEventApplication([saleEvent()]);
    const upcaster = new FakeEventUpcaster({
      "sale-event": aCompletedSaleFact(),
      opened: A_SESSION_OPENED_FACT,
    });
    await run(application, upcaster);
    application.state.events.push(openedEvent());

    await run(application, upcaster, { now: new Date("2026-10-07T12:00:29.000Z") });
    expect(application.event("sale-event").appliedAt).toBeNull();
    expect(application.event("sale-event").attempts).toBe(1);

    await run(application, upcaster, { now: new Date("2026-10-07T12:00:30.000Z") });
    expect(application.event("sale-event").appliedAt).toEqual(new Date("2026-10-07T12:00:30.000Z"));
  });

  it("is retried with a longer wait after each failure", async () => {
    const application = new FakeEventApplication([saleEvent({ attempts: 2 })]);

    await run(application, new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() }));

    expect(application.event("sale-event")).toMatchObject({
      attempts: 3,
      nextAttemptAt: new Date("2026-10-07T12:02:00.000Z"),
    });
  });

  it("is quarantined and flagged when its last allowed attempt fails", async () => {
    const application = new FakeEventApplication([
      saleEvent({ attempts: 7, deviceId: "device-4", aggregateId: "sale-9" }),
    ]);
    const upcaster = new FakeEventUpcaster({
      "sale-event": aCompletedSaleFact({ id: "sale-9" }),
    });

    const outcome = await run(application, upcaster);

    expect(application.event("sale-event")).toMatchObject({
      attempts: 8,
      quarantinedAt: NOW,
      nextAttemptAt: null,
      appliedAt: null,
      error: "depends on CashSession session-1 not applied yet",
    });
    expect(application.state.quarantineAlerts).toEqual([
      {
        deviceId: "device-4",
        eventId: "sale-event",
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId: "sale-9",
        reason: {
          kind: "missing_dependency",
          aggregateType: "CashSession",
          aggregateId: "session-1",
        },
      },
    ]);
    expect(outcome).toMatchObject({ applied: 0, retried: 0, quarantined: 1 });
  });

  it("is flagged as unreadable when no schema reads its payload on its last allowed attempt", async () => {
    const application = new FakeEventApplication([saleEvent({ attempts: 7 })]);

    await run(application, new FakeEventUpcaster({}));

    expect(application.state.quarantineAlerts).toEqual([
      expect.objectContaining({ eventId: "sale-event", reason: { kind: "unreadable" } }),
    ]);
  });

  it("is flagged as not recorded when recording it fails on its last allowed attempt", async () => {
    const application = new FakeEventApplication([
      appliedSessionOpening(),
      saleEvent({ attempts: 7 }),
    ]);
    application.failRecording.set("sale-event", new Error("deadlock detected"));

    await run(application, new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() }));

    expect(application.event("sale-event").error).toBe("deadlock detected");
    expect(application.state.quarantineAlerts).toEqual([
      expect.objectContaining({ eventId: "sale-event", reason: { kind: "not_recorded" } }),
    ]);
  });

  it("is retried, with the reason, when no schema reads its payload", async () => {
    const application = new FakeEventApplication([saleEvent()]);
    const upcaster = new FakeEventUpcaster({});

    await run(application, upcaster);

    expect(application.event("sale-event")).toMatchObject({
      attempts: 1,
      error: upcaster.unreadableReason,
    });
  });

  it("is retried, with the reason, and leaves nothing half applied when recording it fails", async () => {
    const application = new FakeEventApplication([appliedSessionOpening(), saleEvent()]);
    application.failRecording.set("sale-event", new Error("deadlock detected"));

    await run(application, new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() }));

    expect(application.event("sale-event")).toMatchObject({
      appliedAt: null,
      attempts: 1,
      error: "deadlock detected",
    });
    expect(application.state.recorded).toEqual([]);
    expect(application.calls).toContain("rollback");
  });

  it("is retried and leaves nothing half applied when the alert for its invariant break cannot be opened", async () => {
    const application = new FakeEventApplication([appliedSessionOpening(), saleEvent()]);
    application.failOpeningInvariantAlert = true;

    await run(
      application,
      new FakeEventUpcaster({ "sale-event": aCompletedSaleFact({ total: 99999 }) }),
    );

    expect(application.event("sale-event")).toMatchObject({
      appliedAt: null,
      attempts: 1,
      error: "alert store unavailable",
    });
    expect(application.state.recorded).toEqual([]);
  });

  it("describes a failure that is not an error with its text", async () => {
    const application = new FakeEventApplication([appliedSessionOpening(), saleEvent()]);
    application.failRecording.set("sale-event", "just a string");

    await run(application, new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() }));

    expect(application.event("sale-event").error).toBe("just a string");
  });

  it("does not record a failed attempt for an event another worker applied meanwhile", async () => {
    const application = new FakeEventApplication([saleEvent()]);
    application.beforeTransaction = (number) => {
      if (number === 2) {
        application.event("sale-event").appliedAt = new Date("2026-10-07T11:59:00.000Z");
      }
    };

    const outcome = await run(
      application,
      new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() }),
    );

    expect(application.event("sale-event").attempts).toBe(0);
    expect(outcome).toMatchObject({ retried: 0, quarantined: 0 });
  });

  it("does not record a failed attempt for an event that is no longer the earliest of its aggregate", async () => {
    const application = new FakeEventApplication([saleEvent({ deviceSeq: 5 })]);
    application.beforeTransaction = (number) => {
      if (number === 2) {
        application.state.events.push(saleEvent({ eventId: "earlier", deviceSeq: 4 }));
      }
    };

    await run(application, new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() }));

    expect(application.event("sale-event").attempts).toBe(0);
    expect(application.event("earlier").attempts).toBe(0);
  });
});

describe("an aggregate another run is applying", () => {
  const SESSION_1 = { aggregateType: "CashSession", aggregateId: "session-1" };

  it("is skipped while the other aggregates still apply in the same run", async () => {
    const application = new FakeEventApplication([
      openedEvent({ receivedAt: new Date("2026-10-07T10:00:01.000Z") }),
      sessionEvent("other-opened", 1, {
        aggregateId: "session-2",
        eventType: "cash_session_opened",
        receivedAt: new Date("2026-10-07T10:00:02.000Z"),
      }),
    ]);
    application.holdAggregateAsAnotherRun(SESSION_1);
    const upcaster = new FakeEventUpcaster({
      opened: A_SESSION_OPENED_FACT,
      "other-opened": A_SESSION_OPENED_FACT,
    });

    const outcome = await run(application, upcaster);

    expect(application.appliedEventIds).toEqual(["other-opened"]);
    expect(outcome).toMatchObject({ kind: "processed", applied: 1, busy: 1 });
  });

  it("is neither read nor written", async () => {
    const application = new FakeEventApplication([openedEvent()]);
    application.holdAggregateAsAnotherRun(SESSION_1);

    await run(application, new FakeEventUpcaster({ opened: A_SESSION_OPENED_FACT }));

    expect(application.calls).toEqual(["begin", "lock CashSession/session-1", "commit"]);
    expect(application.event("opened")).toMatchObject({ appliedAt: null, attempts: 0 });
  });

  it("ends the run as one that skipped it when nothing else was due", async () => {
    const application = new FakeEventApplication([openedEvent()]);
    application.holdAggregateAsAnotherRun(SESSION_1);

    const outcome = await run(application, new FakeEventUpcaster({}));

    expect(outcome).toEqual({
      kind: "processed",
      applied: 0,
      flagged: 0,
      retried: 0,
      quarantined: 0,
      busy: 1,
      limitReached: false,
    });
  });

  it("records no failed attempt when it is held by another run by the time the failure is recorded", async () => {
    const application = new FakeEventApplication([saleEvent()]);
    application.beforeTransaction = (number) => {
      if (number === 2) {
        application.holdAggregateAsAnotherRun({ aggregateType: "Sale", aggregateId: "sale-1" });
      }
    };

    const outcome = await run(
      application,
      new FakeEventUpcaster({ "sale-event": aCompletedSaleFact() }),
    );

    expect(application.event("sale-event")).toMatchObject({ attempts: 0, error: null });
    expect(outcome).toMatchObject({ retried: 0, quarantined: 0 });
  });
});

describe("what one aggregate's trouble leaves alone", () => {
  it("applies no later event of the aggregate while an earlier one waits for its retry", async () => {
    const application = new FakeEventApplication([
      sessionEvent("first", 1, { nextAttemptAt: new Date("2026-10-07T12:05:00.000Z") }),
      sessionEvent("second", 2),
    ]);
    const upcaster = new FakeEventUpcaster({
      first: A_SESSION_OPENED_FACT,
      second: A_CASH_MOVEMENT_FACT,
    });

    const outcome = await run(application, upcaster);

    expect(application.appliedEventIds).toEqual([]);
    expect(application.transactions).toBe(1);
    expect(outcome).toEqual({ kind: "idle" });
  });

  it("applies no later event of the aggregate after an earlier one failed in the same run", async () => {
    const application = new FakeEventApplication([
      sessionEvent("first", 1),
      sessionEvent("second", 2),
    ]);

    await run(application, new FakeEventUpcaster({ second: A_CASH_MOVEMENT_FACT }));

    expect(application.event("first").attempts).toBe(1);
    expect(application.event("second")).toMatchObject({ attempts: 0, appliedAt: null });
  });

  it("blocks the later events of an aggregate behind a quarantined one", async () => {
    const application = new FakeEventApplication([
      sessionEvent("quarantined", 1, { quarantinedAt: new Date("2026-10-07T11:00:00.000Z") }),
      sessionEvent("later", 2),
    ]);

    const outcome = await run(application, new FakeEventUpcaster({ later: A_CASH_MOVEMENT_FACT }));

    expect(application.appliedEventIds).toEqual([]);
    expect(outcome).toEqual({ kind: "idle" });
  });

  it("keeps applying every other aggregate while one is quarantined or failing", async () => {
    const application = new FakeEventApplication([
      saleEvent({ eventId: "quarantined", quarantinedAt: new Date("2026-10-07T11:00:00.000Z") }),
      saleEvent({ eventId: "later-same-aggregate", deviceSeq: 2 }),
      saleEvent({ eventId: "failing", aggregateId: "sale-2" }),
      openedEvent(),
      sessionEvent("after-opening", 2),
    ]);
    const upcaster = new FakeEventUpcaster({
      opened: A_SESSION_OPENED_FACT,
      "after-opening": A_CASH_MOVEMENT_FACT,
    });

    const outcome = await run(application, upcaster);

    expect(application.appliedEventIds).toEqual(["opened", "after-opening"]);
    expect(outcome).toMatchObject({ applied: 2, retried: 1 });
  });
});

describe("an event that breaks an invariant of its own aggregate", () => {
  it("is applied anyway, flagged with what it breaks, and never quarantined", async () => {
    const application = new FakeEventApplication([
      appliedSessionOpening(),
      saleEvent({ aggregateId: "sale-7" }),
    ]);
    const upcaster = new FakeEventUpcaster({
      "sale-event": aCompletedSaleFact({ id: "sale-7", total: 99999 }),
    });

    const outcome = await run(application, upcaster);

    expect(application.event("sale-event")).toMatchObject({
      appliedAt: NOW,
      quarantinedAt: null,
      attempts: 0,
    });
    expect(application.state.recorded.map((one) => one.eventId)).toEqual(["sale-event"]);
    expect(application.state.invariantAlerts).toEqual([
      {
        eventId: "sale-event",
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId: "sale-7",
        breaks: ["approved_payments_below_total"],
      },
    ]);
    expect(application.state.quarantineAlerts).toEqual([]);
    expect(outcome).toMatchObject({ applied: 1, flagged: 1, quarantined: 0 });
  });

  it("is applied without any alert when its lines' frozen prices differ from the current prices", async () => {
    const application = new FakeEventApplication([appliedSessionOpening(), saleEvent()]);
    const fact = aCompletedSaleFact({
      total: 1,
      lines: [
        {
          id: "line-1",
          productId: "product-1",
          productName: "Yerba mate 1 kg",
          quantity: 1,
          listUnitPrice: 1,
          priceListId: "outdated-price-list",
          promotionId: null,
          discountAmount: 0,
          lineTotal: 1,
        },
      ],
      payments: [
        {
          id: "payment-1",
          method: "CASH",
          provider: "NONE",
          amount: 1,
          tendered: 1,
          state: "APPROVED",
          occurredAt: NOW,
          authorizedBy: null,
          confirmedAt: null,
        },
      ],
    });

    const outcome = await run(application, new FakeEventUpcaster({ "sale-event": fact }));

    expect(application.event("sale-event").appliedAt).toEqual(NOW);
    expect(application.state.invariantAlerts).toEqual([]);
    expect(application.state.quarantineAlerts).toEqual([]);
    expect(outcome).toMatchObject({ applied: 1, flagged: 0 });
  });
});
