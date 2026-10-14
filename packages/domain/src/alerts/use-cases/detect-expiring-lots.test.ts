import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { detectExpiringLots } from "./detect-expiring-lots.js";
import { FixedClock } from "./test-support/fake-alert-store.js";
import {
  FakeBranchExpiringLotReader,
  FakeBranchExpiryWindowReader,
  FakeExpiringLotAlerts,
} from "./test-support/fake-expiring-lot-alerts.js";

const TODAY = "2026-10-13";
const NOW = new Date(argentinaInstant(TODAY, "12:00"));

function lot(
  overrides: {
    locationId?: string;
    expiresOn?: string | null;
    technical?: boolean;
    remaining?: number;
  } = {},
) {
  return {
    locationId: "branch-1",
    expiresOn: "2026-10-20" as string | null,
    technical: false,
    remaining: 5,
    ...overrides,
  };
}

function detect({
  branches = [{ locationId: "branch-1", windowDays: 30 }],
  lots = [],
  openScopes = [],
  now = NOW,
}: {
  branches?: { locationId: string; windowDays: number }[];
  lots?: ReturnType<typeof lot>[];
  openScopes?: string[];
  now?: Date;
}) {
  const reader = new FakeBranchExpiringLotReader(lots);
  const alerts = new FakeExpiringLotAlerts(openScopes);
  const outcome = detectExpiringLots({
    branches: new FakeBranchExpiryWindowReader(branches),
    lots: reader,
    alerts,
    clock: new FixedClock(now),
  });
  return { reader, alerts, outcome };
}

function holds(locationId: string, lotCount: number, windowDays = 30) {
  return {
    holds: true,
    alert: {
      kind: "lots_expiring",
      scope: locationId,
      locationId,
      detail: { lotCount, windowDays },
    },
  };
}

function cleared(locationId: string) {
  return { holds: false, kind: "lots_expiring", scope: locationId };
}

describe("detectExpiringLots", () => {
  it("opens the alert for a branch with a lot expiring within its window, counting its lots", async () => {
    const { alerts, outcome } = detect({
      lots: [lot(), lot({ expiresOn: "2026-11-12" })],
    });

    await expect(outcome).resolves.toBe(1);
    expect(alerts.observations).toEqual([holds("branch-1", 2)]);
  });

  it("counts an expired lot that still holds stock", async () => {
    const { alerts, outcome } = detect({ lots: [lot({ expiresOn: "2026-09-01" })] });
    await outcome;

    expect(alerts.observations).toEqual([holds("branch-1", 1)]);
  });

  it("reads each branch's lots up to the last day of its own window, counted from Argentina's calendar day", async () => {
    const { reader, outcome } = detect({
      branches: [
        { locationId: "branch-1", windowDays: 30 },
        { locationId: "branch-2", windowDays: 7 },
      ],
      now: new Date("2026-10-13T02:30:00.000Z"),
    });
    await outcome;

    expect(reader.reads).toEqual([
      { locationId: "branch-1", lastDay: "2026-11-11" },
      { locationId: "branch-2", lastDay: "2026-10-19" },
    ]);
  });

  it("counts a lot expiring on the last day of the window but not the day after", async () => {
    const { alerts, outcome } = detect({
      lots: [lot({ expiresOn: "2026-11-12" }), lot({ expiresOn: "2026-11-13" })],
    });
    await outcome;

    expect(alerts.observations).toEqual([holds("branch-1", 1)]);
  });

  it.each([
    ["a lot beyond the window", { expiresOn: "2026-12-31" }],
    ["a lot with nothing left", { remaining: 0 }],
    ["a lot in debt", { remaining: -2 }],
    ["a lot without an expiry day", { expiresOn: null }],
    ["a technical lot", { technical: true }],
  ])("does not count %s", async (_case, overrides) => {
    const { alerts, outcome } = detect({ lots: [lot(overrides)] });

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([]);
  });

  it("leaves out of the count the lots the rule refuses while counting the ones it accepts", async () => {
    const { alerts, outcome } = detect({
      lots: [lot({ remaining: 0 }), lot(), lot({ technical: true }), lot({ expiresOn: null })],
    });
    await outcome;

    expect(alerts.observations).toEqual([holds("branch-1", 1)]);
  });

  it("gives each branch its own window and does not count another branch's lots", async () => {
    const { alerts, outcome } = detect({
      branches: [
        { locationId: "branch-1", windowDays: 30 },
        { locationId: "branch-2", windowDays: 7 },
        { locationId: "branch-3", windowDays: 30 },
      ],
      lots: [
        lot({ locationId: "branch-1", expiresOn: "2026-11-01" }),
        lot({ locationId: "branch-2", expiresOn: "2026-11-01" }),
        lot({ locationId: "branch-3", expiresOn: "2026-10-15" }),
        lot({ locationId: "branch-3", expiresOn: "2026-10-16" }),
      ],
    });

    await expect(outcome).resolves.toBe(2);
    expect(alerts.observations).toEqual([holds("branch-1", 1), holds("branch-3", 2)]);
  });

  it("keeps observing the condition, with the latest count, while the alert is open", async () => {
    const { alerts, outcome } = detect({
      lots: [lot(), lot(), lot()],
      openScopes: ["branch-1"],
    });
    await outcome;

    expect(alerts.observations).toEqual([holds("branch-1", 3)]);
  });

  it("clears the open alert of a branch once none of its lots is left within its window", async () => {
    const { alerts, outcome } = detect({
      lots: [lot({ expiresOn: "2026-12-31" })],
      openScopes: ["branch-1"],
    });

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([cleared("branch-1")]);
  });

  it("clears the open alert of a branch that no longer exists", async () => {
    const { alerts, outcome } = detect({ branches: [], openScopes: ["branch-9"] });
    await outcome;

    expect(alerts.observations).toEqual([cleared("branch-9")]);
  });

  it("clears only the open alerts whose branch has no lot left", async () => {
    const { alerts, outcome } = detect({
      branches: [
        { locationId: "branch-1", windowDays: 30 },
        { locationId: "branch-2", windowDays: 30 },
      ],
      lots: [lot({ locationId: "branch-2" })],
      openScopes: ["branch-1", "branch-2"],
    });
    await outcome;

    expect(alerts.observations).toEqual([holds("branch-2", 1), cleared("branch-1")]);
  });

  it("observes nothing for a branch without lots and without an open alert", async () => {
    const { alerts, outcome } = detect({
      branches: [
        { locationId: "branch-1", windowDays: 30 },
        { locationId: "branch-2", windowDays: 30 },
      ],
    });

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([]);
  });
});
