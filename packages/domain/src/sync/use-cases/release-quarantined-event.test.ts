import { describe, expect, it } from "vitest";
import { A_CASH_MOVEMENT_FACT, A_SESSION_OPENED_FACT } from "../model/test-support/synced-facts.js";
import { applyPendingEvents } from "./apply-pending-events.js";
import { releaseQuarantinedEvent } from "./release-quarantined-event.js";
import {
  aStoredEvent,
  FakeEventApplication,
  FakeEventUpcaster,
  type FakeStoredEvent,
} from "./test-support/fake-event-application.js";
import { FakeQuarantineRelease } from "./test-support/fake-quarantine-release.js";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const QUARANTINED_AT = new Date("2026-10-07T12:00:00.000Z");
const BRANCH = "branch-1";
const OTHER_BRANCH = "branch-2";

const registers = [
  { deviceId: "device-1", locationId: BRANCH },
  { deviceId: "device-2", locationId: OTHER_BRANCH },
];

const quarantined = (overrides: Partial<FakeStoredEvent> = {}) =>
  aStoredEvent({
    eventId: "stuck",
    aggregateType: "CashSession",
    aggregateId: "session-1",
    eventType: "cash_session_opened",
    schemaVersion: 1,
    attempts: 8,
    quarantinedAt: QUARANTINED_AT,
    error: "depends on Product p-1 not applied yet",
    ...overrides,
  });

function setup(events: FakeStoredEvent[]) {
  const application = new FakeEventApplication(events);
  const release = new FakeQuarantineRelease(application, registers);
  const releaseWith = (eventId: string, locationId = BRANCH) =>
    releaseQuarantinedEvent(
      { quarantineRelease: release, clock: { now: () => NOW } },
      { eventId, locationId, releasedBy: "admin-1" },
    );
  return { application, release, releaseWith };
}

describe("releasing a quarantined event", () => {
  it("gives the event a new series of attempts and leaves its payload, order and last error as they were", async () => {
    const stuck = quarantined({ payload: { opened: true }, deviceSeq: 4 });
    const { application, releaseWith } = setup([stuck]);

    const outcome = await releaseWith("stuck");

    expect(outcome).toEqual({ kind: "released" });
    expect(application.event("stuck")).toEqual({
      ...stuck,
      attempts: 0,
      nextAttemptAt: null,
      quarantinedAt: null,
    });
  });

  it("records who released which event, when, and what it was before and became", async () => {
    const { application, releaseWith } = setup([quarantined()]);

    await releaseWith("stuck");

    expect(application.state.releases).toEqual([
      {
        eventId: "stuck",
        releasedBy: "admin-1",
        releasedAt: NOW,
        previous: {
          quarantinedAt: QUARANTINED_AT,
          attempts: 8,
          lastError: "depends on Product p-1 not applied yet",
        },
        released: { attempts: 0, nextAttemptAt: null, quarantinedAt: null },
      },
    ]);
  });

  it("resolves the quarantine alert of that event only", async () => {
    const { application, releaseWith } = setup([quarantined(), quarantined({ eventId: "other" })]);
    application.state.quarantineAlerts = ["stuck", "other"].map((eventId) => ({
      deviceId: "device-1",
      eventId,
      eventType: "cash_session_opened",
      aggregateType: "CashSession",
      aggregateId: "session-1",
      reason: { kind: "not_recorded" },
    }));

    await releaseWith("stuck");

    expect(application.state.resolvedQuarantineAlerts).toEqual(["stuck"]);
    expect(application.state.quarantineAlerts.map((alert) => alert.eventId)).toEqual(["other"]);
  });

  it("looks the event up inside the branch, waits for its aggregate, then locks the event, and only then changes anything", async () => {
    const { release, releaseWith } = setup([quarantined()]);

    await releaseWith("stuck");

    expect(release.calls).toEqual([
      "begin",
      "find aggregate of stuck",
      "wait for CashSession/session-1",
      "lock event stuck",
      "release stuck",
      "record release of stuck",
      "resolve alert of stuck",
      "commit",
    ]);
  });

  it("answers not found for an event nobody received, touching nothing", async () => {
    const { application, release, releaseWith } = setup([quarantined()]);

    const outcome = await releaseWith("missing");

    expect(outcome).toEqual({ kind: "not_found" });
    expect(release.calls).toEqual(["begin", "find aggregate of missing", "commit"]);
    expect(application.state.releases).toEqual([]);
  });

  it("answers not found for an event of a register of another branch, as if it did not exist", async () => {
    const { application, release, releaseWith } = setup([quarantined({ deviceId: "device-2" })]);

    const outcome = await releaseWith("stuck");

    expect(outcome).toEqual({ kind: "not_found" });
    expect(release.calls).not.toContain("wait for CashSession/session-1");
    expect(application.event("stuck").quarantinedAt).toEqual(QUARANTINED_AT);
  });

  it.each([
    ["an applied event", { appliedAt: QUARANTINED_AT, quarantinedAt: null }],
    ["an applied event once quarantined", { appliedAt: QUARANTINED_AT }],
    ["a pending event that was never quarantined", { quarantinedAt: null, attempts: 2 }],
  ])("refuses %s and changes nothing", async (_name, overrides) => {
    const event = quarantined(overrides);
    const { application, release, releaseWith } = setup([structuredClone(event)]);

    const outcome = await releaseWith("stuck");

    expect(outcome).toEqual({ kind: "not_quarantined" });
    expect(application.event("stuck")).toEqual(event);
    expect(application.state.releases).toEqual([]);
    expect(application.state.resolvedQuarantineAlerts).toEqual([]);
    expect(release.calls.at(-1)).toBe("commit");
    expect(release.calls.filter((call) => call.startsWith("release "))).toEqual([]);
  });

  it("rolls back everything when recording the release fails", async () => {
    const event = quarantined();
    const { application, release, releaseWith } = setup([structuredClone(event)]);
    release.failRecordingRelease = true;

    await expect(releaseWith("stuck")).rejects.toThrow("audit log unavailable");

    expect(application.event("stuck")).toEqual(event);
    expect(application.state.releases).toEqual([]);
    expect(release.calls.at(-1)).toBe("rollback");
  });

  it("rolls back the release when resolving the alert fails", async () => {
    const event = quarantined();
    const { application, release, releaseWith } = setup([structuredClone(event)]);
    release.failResolvingAlert = true;

    await expect(releaseWith("stuck")).rejects.toThrow("alert store unavailable");

    expect(application.event("stuck")).toEqual(event);
    expect(application.state.releases).toEqual([]);
  });
});

describe("what a release does to the events applied after it", () => {
  const laterMovement = (eventId: string, deviceSeq: number) =>
    aStoredEvent({
      eventId,
      deviceSeq,
      aggregateType: "CashSession",
      aggregateId: "session-1",
      eventType: "cash_movement_recorded",
      schemaVersion: 1,
    });

  const facts = {
    stuck: A_SESSION_OPENED_FACT,
    second: A_CASH_MOVEMENT_FACT,
    third: A_CASH_MOVEMENT_FACT,
  };

  const run = (application: FakeEventApplication, upcaster: FakeEventUpcaster, now = NOW) =>
    applyPendingEvents(
      { eventApplication: application, upcaster, clock: { now: () => now } },
      { limit: 100 },
    );

  it("holds back the later events of its aggregate while it is quarantined, then applies it and them in order once released", async () => {
    const { application, releaseWith } = setup([
      laterMovement("third", 3),
      quarantined({ deviceSeq: 1 }),
      laterMovement("second", 2),
    ]);
    const upcaster = new FakeEventUpcaster(facts);

    const blocked = await run(application, upcaster);
    expect(blocked).toEqual({ kind: "idle" });
    expect(application.appliedEventIds).toEqual([]);

    await releaseWith("stuck");
    const applied = await run(application, upcaster);

    expect(applied).toMatchObject({ kind: "processed", applied: 3 });
    expect(application.appliedEventIds).toEqual(["stuck", "second", "third"]);
  });

  it("quarantines a released event again after a full new series of failures and opens its alert again", async () => {
    const { application, releaseWith } = setup([quarantined(), laterMovement("second", 2)]);
    const unreadable = new FakeEventUpcaster({ second: A_CASH_MOVEMENT_FACT });
    application.state.quarantineAlerts = [];
    await releaseWith("stuck");

    const attemptsAfterEachRun: number[] = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await run(application, unreadable, new Date(NOW.getTime() + (attempt + 1) * 3_600_000));
      attemptsAfterEachRun.push(application.event("stuck").attempts);
    }

    expect(attemptsAfterEachRun).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(application.event("stuck").quarantinedAt).not.toBeNull();
    expect(application.state.quarantineAlerts.map((alert) => alert.eventId)).toEqual(["stuck"]);
    expect(application.appliedEventIds).toEqual([]);
  });
});
