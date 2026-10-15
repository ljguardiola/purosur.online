import { describe, expect, it } from "vitest";
import { detectFortnightReportRegularizations } from "./detect-fortnight-report-regularizations.js";
import type { FortnightRegularizationCandidate } from "./fortnight-report-regularization-ports.js";
import {
  FakeFortnightRegularizationCandidateReader,
  FakeFortnightReportRegularizationAlerts,
} from "./test-support/fake-fortnight-report-regularizations.js";

const FIRST_HALF = { start: "2026-09-01", end: "2026-09-15" };
const SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };

function presentation(
  overrides: Partial<FortnightRegularizationCandidate> = {},
): FortnightRegularizationCandidate {
  return { pointOfSaleNumber: 4, registerId: "register-1", fortnight: FIRST_HALF, ...overrides };
}

function detect(
  presentations: FortnightRegularizationCandidate[],
  alerts = new FakeFortnightReportRegularizationAlerts(),
) {
  const outcome = detectFortnightReportRegularizations({
    presentations: new FakeFortnightRegularizationCandidateReader(presentations),
    alerts,
  });
  return { alerts, outcome };
}

function alertOf(pointOfSaleNumber: number, fortnight: { start: string; end: string }) {
  return {
    kind: "fortnight_report_needs_regularization",
    scope: `${pointOfSaleNumber}:${fortnight.start}`,
    detail: {
      pointOfSaleNumber,
      registerId: "register-1",
      fortnightStart: fortnight.start,
      fortnightEnd: fortnight.end,
    },
  };
}

describe("detectFortnightReportRegularizations", () => {
  it("opens one alert for each presentation that needs regularization and counts them", async () => {
    const { alerts, outcome } = detect([
      presentation(),
      presentation({ fortnight: SECOND_HALF }),
      presentation({ pointOfSaleNumber: 5 }),
    ]);

    await expect(outcome).resolves.toBe(3);
    expect(alerts.openedAlerts).toEqual([
      alertOf(4, FIRST_HALF),
      alertOf(4, SECOND_HALF),
      alertOf(5, FIRST_HALF),
    ]);
  });

  it("opens nothing when no presentation needs regularization", async () => {
    const { alerts, outcome } = detect([]);

    await expect(outcome).resolves.toBe(0);
    expect(alerts.openedAlerts).toEqual([]);
  });

  it("does not open the alert again once it was opened, even if a person closed it", async () => {
    const alerts = new FakeFortnightReportRegularizationAlerts({ openedScopes: ["4:2026-09-01"] });

    const { outcome } = detect([presentation(), presentation({ fortnight: SECOND_HALF })], alerts);

    await expect(outcome).resolves.toBe(1);
    expect(alerts.openedAlerts).toEqual([alertOf(4, SECOND_HALF)]);
  });
});
