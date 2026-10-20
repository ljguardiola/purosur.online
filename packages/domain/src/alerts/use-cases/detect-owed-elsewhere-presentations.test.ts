import { describe, expect, it } from "vitest";
import type { ListedOwedPresentation } from "../../fiscal/index.js";
import { detectOwedElsewherePresentations } from "./detect-owed-elsewhere-presentations.js";
import {
  FakeOwedElsewhereAlerts,
  FakeOwedElsewherePresentationReader,
} from "./test-support/fake-owed-elsewhere-presentations.js";

const FIRST_HALF = { start: "2026-09-01", end: "2026-09-15" };
const SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };

function owed(pointOfSaleNumber: number, fortnight = FIRST_HALF): ListedOwedPresentation {
  return { pointOfSaleNumber, fortnight };
}

function holds(pointOfSaleNumber: number, fortnight = FIRST_HALF) {
  return {
    holds: true,
    alert: {
      kind: "fortnight_report_owed_elsewhere",
      scope: `${pointOfSaleNumber}:${fortnight.start}`,
      detail: { pointOfSaleNumber, fortnightStart: fortnight.start, fortnightEnd: fortnight.end },
    },
  };
}

function detect(presentations: ListedOwedPresentation[], alerts = new FakeOwedElsewhereAlerts()) {
  return {
    alerts,
    outcome: detectOwedElsewherePresentations({
      presentations: new FakeOwedElsewherePresentationReader(presentations),
      alerts,
    }),
  };
}

describe("detectOwedElsewherePresentations", () => {
  it("observes the condition of each presentation owed elsewhere, naming its point of sale and fortnight, and counts them", async () => {
    const { alerts, outcome } = detect([owed(9), owed(8, SECOND_HALF)]);

    await expect(outcome).resolves.toBe(2);
    expect(alerts.observations).toEqual([holds(9), holds(8, SECOND_HALF)]);
  });

  it("observes a presentation listed twice once", async () => {
    const { alerts, outcome } = detect([owed(9), owed(9, { ...FIRST_HALF })]);

    await expect(outcome).resolves.toBe(1);
    expect(alerts.observations).toEqual([holds(9)]);
  });

  it("clears the condition of a scope no longer owed elsewhere and keeps the ones still owed", async () => {
    const { alerts, outcome } = detect(
      [owed(9)],
      new FakeOwedElsewhereAlerts(["9:2026-09-01", "8:2026-09-16"]),
    );

    await expect(outcome).resolves.toBe(1);
    expect(alerts.observations).toEqual([
      holds(9),
      { holds: false, kind: "fortnight_report_owed_elsewhere", scope: "8:2026-09-16" },
    ]);
  });

  it("clears every alert when nothing is owed elsewhere", async () => {
    const { alerts, outcome } = detect([], new FakeOwedElsewhereAlerts(["9:2026-09-01"]));

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([
      { holds: false, kind: "fortnight_report_owed_elsewhere", scope: "9:2026-09-01" },
    ]);
  });

  it("observes nothing when nothing is owed elsewhere and no alert is open", async () => {
    const { alerts, outcome } = detect([]);

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([]);
  });
});
