import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { detectFortnightReportDeadlines } from "./detect-fortnight-report-deadlines.js";
import type { OwedFortnightPresentation } from "./fortnight-report-deadline-ports.js";
import { FixedClock } from "./test-support/fake-alert-store.js";
import {
  FakeFortnightReportDeadlineAlerts,
  FakeOwedFortnightPresentationReader,
} from "./test-support/fake-fortnight-report-deadlines.js";

const FORTNIGHT = { start: "2026-09-01", end: "2026-09-15" };
const SCOPE = "4:2026-09-01";
const REGISTER_ID = "register-1";

function at(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time));
}

function owed(overrides: Partial<OwedFortnightPresentation> = {}): OwedFortnightPresentation {
  return {
    pointOfSaleNumber: 4,
    registerId: REGISTER_ID,
    fortnight: FORTNIGHT,
    taxAuthorityDeadline: "2026-09-25",
    state: null,
    ...overrides,
  };
}

function detect(
  presentations: OwedFortnightPresentation[],
  moment: Date,
  alerts = new FakeFortnightReportDeadlineAlerts(),
) {
  const reader = new FakeOwedFortnightPresentationReader(presentations);
  const outcome = detectFortnightReportDeadlines({
    presentations: reader,
    alerts,
    clock: new FixedClock(moment),
  });
  return { reader, alerts, outcome };
}

function pending(level: string, detail: Record<string, unknown>, scope = SCOPE) {
  return {
    holds: true,
    level,
    alert: {
      kind: "fortnight_report_pending",
      scope,
      detail: {
        pointOfSaleNumber: 4,
        registerId: REGISTER_ID,
        fortnightStart: "2026-09-01",
        fortnightEnd: "2026-09-15",
        deadline: "2026-09-23",
        daysLeft: 7,
        reason: "pending",
        ...detail,
      },
    },
  };
}

function clearedPending(scope: string) {
  return { holds: false, kind: "fortnight_report_pending", scope };
}

describe("detectFortnightReportDeadlines", () => {
  it("asks for the presentations owed on the day, by Argentina's calendar", async () => {
    const { reader, outcome } = detect([], new Date("2026-09-17T02:30:00.000Z"));
    await outcome;

    expect(reader.requestedDays).toEqual(["2026-09-16"]);
  });

  it("opens the notice at the warning level on the day after the fortnight closes, counting the days left to the eighth day", async () => {
    const { alerts, outcome } = detect([owed()], at("2026-09-16"));

    await expect(outcome).resolves.toBe(1);
    expect(alerts.observations).toEqual([pending("warning", { daysLeft: 7 })]);
  });

  it("reports nothing on the day the fortnight closes, before it is owed", async () => {
    const { alerts, outcome } = detect([owed()], at("2026-09-15"));

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([]);
  });

  it("refreshes the days left every day the presentation stays pending", async () => {
    const alerts = new FakeFortnightReportDeadlineAlerts();

    await detect([owed()], at("2026-09-16"), alerts).outcome;
    await detect([owed()], at("2026-09-17"), alerts).outcome;
    await detect([owed()], at("2026-09-18"), alerts).outcome;

    expect(alerts.observations).toEqual([
      pending("warning", { daysLeft: 7 }),
      pending("warning", { daysLeft: 6 }),
      pending("warning", { daysLeft: 5 }),
    ]);
  });

  it.each([
    ["2026-09-21", 2, "warning"],
    ["2026-09-22", 1, "critical"],
    ["2026-09-23", 0, "critical"],
  ] as const)("on %s, with %i days left, the notice is %s", async (day, daysLeft, level) => {
    const { alerts, outcome } = detect([owed()], at(day));
    await outcome;

    expect(alerts.observations).toEqual([pending(level, { daysLeft })]);
  });

  it("follows the tax authority's own deadline when it comes before the eighth day", async () => {
    const { alerts, outcome } = detect(
      [owed({ taxAuthorityDeadline: "2026-09-20" })],
      at("2026-09-16"),
    );
    await outcome;

    expect(alerts.observations).toEqual([
      pending("warning", { daysLeft: 4, deadline: "2026-09-20" }),
    ]);
  });

  it("says a presentation never recorded is pending", async () => {
    const { alerts, outcome } = detect([owed({ state: "submitting" })], at("2026-09-16"));
    await outcome;

    expect(alerts.observations).toEqual([pending("warning", { reason: "pending" })]);
  });

  it("says a blocked presentation is blocked, as a warning while the deadline is not pressing", async () => {
    const { alerts, outcome } = detect([owed({ state: "blocked" })], at("2026-09-16"));
    await outcome;

    expect(alerts.observations).toEqual([pending("warning", { reason: "blocked" })]);
  });

  it("says a presentation the tax authority refused is refused", async () => {
    const { alerts, outcome } = detect([owed({ state: "refused" })], at("2026-09-16"));
    await outcome;

    expect(alerts.observations).toEqual([pending("warning", { reason: "refused" })]);
  });

  it("reports each point of sale's presentation on its own scope", async () => {
    const { alerts, outcome } = detect(
      [owed(), owed({ pointOfSaleNumber: 5, registerId: "register-2" })],
      at("2026-09-16"),
    );

    await expect(outcome).resolves.toBe(2);
    expect(alerts.observations).toEqual([
      pending("warning", {}),
      pending("warning", { pointOfSaleNumber: 5, registerId: "register-2" }, "5:2026-09-01"),
    ]);
  });

  describe("once the deadline is missed", () => {
    const missedDay = at("2026-09-24");

    it("opens the overdue alert, naming the point of sale, its register, the fortnight and the deadline", async () => {
      const { alerts, outcome } = detect([owed()], missedDay);

      await expect(outcome).resolves.toBe(0);
      expect(alerts.overdueAlerts).toEqual([
        {
          kind: "fortnight_report_overdue",
          scope: SCOPE,
          detail: {
            pointOfSaleNumber: 4,
            registerId: REGISTER_ID,
            fortnightStart: "2026-09-01",
            fortnightEnd: "2026-09-15",
            deadline: "2026-09-23",
          },
        },
      ]);
      expect(alerts.observations).toEqual([]);
    });

    it("stops holding the pending condition of the presentation", async () => {
      const { alerts, outcome } = detect(
        [owed()],
        missedDay,
        new FakeFortnightReportDeadlineAlerts({ pendingScopes: [SCOPE] }),
      );
      await outcome;

      expect(alerts.observations).toEqual([clearedPending(SCOPE)]);
    });

    it("opens the overdue alert only once, however many days it stays missed", async () => {
      const alerts = new FakeFortnightReportDeadlineAlerts();

      await detect([owed()], at("2026-09-24"), alerts).outcome;
      await detect([owed()], at("2026-09-25"), alerts).outcome;

      expect(alerts.overdueAlerts).toHaveLength(1);
    });

    it("never opens it again once a person has closed it", async () => {
      const { alerts, outcome } = detect(
        [owed()],
        at("2026-10-02"),
        new FakeFortnightReportDeadlineAlerts({ overdueScopes: [SCOPE] }),
      );
      await outcome;

      expect(alerts.overdueAlerts).toEqual([]);
    });

    it("opens the overdue alert of each missed presentation on its own", async () => {
      const { alerts, outcome } = detect(
        [owed(), owed({ pointOfSaleNumber: 5, registerId: "register-2" })],
        missedDay,
        new FakeFortnightReportDeadlineAlerts({ overdueScopes: [SCOPE] }),
      );
      await outcome;

      expect(alerts.overdueAlerts.map(({ scope }) => scope)).toEqual(["5:2026-09-01"]);
    });

    it("misses the tax authority's own deadline when it comes first", async () => {
      const { alerts, outcome } = detect(
        [owed({ taxAuthorityDeadline: "2026-09-20" })],
        at("2026-09-21"),
      );
      await outcome;

      expect(alerts.overdueAlerts).toHaveLength(1);
    });
  });

  it("stops holding the pending condition of a presentation that is no longer owed, once accepted", async () => {
    const { alerts, outcome } = detect(
      [],
      at("2026-09-18"),
      new FakeFortnightReportDeadlineAlerts({ pendingScopes: [SCOPE] }),
    );

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([clearedPending(SCOPE)]);
  });

  it("keeps holding the pending condition of a presentation still owed, without clearing it", async () => {
    const { alerts, outcome } = detect(
      [owed()],
      at("2026-09-18"),
      new FakeFortnightReportDeadlineAlerts({ pendingScopes: [SCOPE] }),
    );
    await outcome;

    expect(alerts.observations).toEqual([pending("warning", { daysLeft: 5 })]);
  });

  it("neither holds nor opens anything for a presentation already accepted or whose fortnight has not closed", async () => {
    const { alerts, outcome } = detect(
      [
        owed({ state: "accepted" }),
        owed({ pointOfSaleNumber: 5, fortnight: { start: "2026-09-16", end: "2026-09-30" } }),
      ],
      at("2026-09-30"),
    );

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([]);
    expect(alerts.overdueAlerts).toEqual([]);
  });

  it("does not open an overdue alert for a presentation still within its deadline", async () => {
    const { alerts, outcome } = detect([owed()], at("2026-09-23"));
    await outcome;

    expect(alerts.overdueAlerts).toEqual([]);
  });
});
