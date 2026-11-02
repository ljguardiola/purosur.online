import { describe, expect, it } from "vitest";
import type {
  ArcaAvailabilityRun,
  ContingencyPart,
  RecordedExceptionShareBreach,
} from "../../fiscal/index.js";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { detectSecondNonCompliantMonthRisks } from "./detect-second-month-risks.js";
import { FixedClock } from "./test-support/fake-alert-store.js";
import {
  FakeSecondMonthRiskAlerts,
  FakeSecondMonthRiskReader,
} from "./test-support/fake-second-month-risk.js";

function at(day: string): Date {
  return new Date(argentinaInstant(day, "12:00", FIXED_ARGENTINA_ZONE_RULES));
}

function recorded(fiscalAddressId: string, month: string): RecordedExceptionShareBreach {
  return {
    fiscalAddressId,
    fiscalAddressName: `Address ${fiscalAddressId}`,
    month,
    exceptionCount: 6,
    totalCount: 100,
  };
}

function running(
  fiscalAddressId: string,
  month: string,
  exceptionCount: number,
  totalCount: number,
) {
  return { fiscalAddressId, month, exceptionCount, totalCount };
}

const HOUR_MS = 3_600_000;

function availableSince(day: string, until: string): ArcaAvailabilityRun[] {
  return [{ ok: true, firstCheckedAt: at(day), lastCheckedAt: at(until) }];
}

function contingencyOf(
  fiscalAddressId: string,
  day: string,
  hours: number,
): [string, { parts: ContingencyPart[]; registers: [] }] {
  const start = at(day);
  return [
    fiscalAddressId,
    {
      parts: [
        { registerId: "r-1", start, end: new Date(start.getTime() + Math.round(hours * HOUR_MS)) },
      ],
      registers: [],
    },
  ];
}

function detect({
  today,
  breaches = [],
  counts = [],
  alerts = new FakeSecondMonthRiskAlerts(),
  addresses,
  runs,
  contingency,
}: {
  today: string;
  breaches?: RecordedExceptionShareBreach[];
  counts?: ReturnType<typeof running>[];
  alerts?: FakeSecondMonthRiskAlerts;
  addresses?: { fiscalAddressId: string; fiscalAddressName: string }[];
  runs?: ArcaAvailabilityRun[];
  contingency?: ReadonlyMap<string, { parts: ContingencyPart[]; registers: [] }>;
}) {
  const risks = new FakeSecondMonthRiskReader({ breaches, counts, addresses, runs, contingency });
  const outcome = detectSecondNonCompliantMonthRisks({
    risks,
    alerts,
    clock: new FixedClock(at(today)),
    zoneRules: new FakeZoneRulesSource(),
  });
  return { alerts, outcome, risks };
}

function held(
  fiscalAddressId: string,
  month: string,
  previousMonth: string,
  figures: {
    exceptionCount: number;
    totalCount: number;
    exceptionShareTenthsOfPercent: number | null;
    previousMonthNonCompliantOn?: string[];
    contingencyShareTenthsOfPercent?: number | null;
  },
) {
  return {
    holds: true,
    alert: {
      kind: "second_non_compliant_month_at_risk",
      scope: `${fiscalAddressId}:${month}`,
      detail: {
        fiscalAddressId,
        fiscalAddressName: `Address ${fiscalAddressId}`,
        month,
        previousMonth,
        exceptionShareNonCompliancePercent: 5,
        contingencyNonCompliancePercent: 5,
        previousMonthNonCompliantOn: ["exception_share"],
        contingencyShareTenthsOfPercent: null,
        ...figures,
      },
    },
  };
}

describe("detectSecondNonCompliantMonthRisks", () => {
  it("warns about the month in progress when the previous month is recorded, with the running share", async () => {
    const { alerts, outcome } = detect({
      today: "2026-11-10",
      breaches: [recorded("fa-1", "2026-10")],
      counts: [running("fa-1", "2026-11", 3, 80)],
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([
      held("fa-1", "2026-11", "2026-10", {
        exceptionCount: 3,
        totalCount: 80,
        exceptionShareTenthsOfPercent: 37,
      }),
    ]);
  });

  it("raises no warning when the previous month is not recorded, even with the running share over the limit", async () => {
    const { alerts, outcome } = detect({
      today: "2026-11-10",
      breaches: [recorded("fa-1", "2026-09")],
      counts: [running("fa-1", "2026-11", 9, 100)],
    });

    expect(await outcome).toBe(0);
    expect(alerts.observations).toEqual([]);
  });

  it("clears the warning of the month that has closed", async () => {
    const alerts = new FakeSecondMonthRiskAlerts(["fa-1:2026-11"]);

    const { outcome } = detect({
      today: "2026-12-01",
      breaches: [recorded("fa-1", "2026-10"), recorded("fa-1", "2026-11")],
      alerts,
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([
      held("fa-1", "2026-12", "2026-11", {
        exceptionCount: 0,
        totalCount: 0,
        exceptionShareTenthsOfPercent: null,
      }),
      { holds: false, kind: "second_non_compliant_month_at_risk", scope: "fa-1:2026-11" },
    ]);
  });

  it("clears the warning of an address whose previous month is no longer recorded at all", async () => {
    const alerts = new FakeSecondMonthRiskAlerts(["fa-1:2026-12"]);

    const { outcome } = detect({ today: "2027-01-05", alerts });

    expect(await outcome).toBe(0);
    expect(alerts.observations).toEqual([
      { holds: false, kind: "second_non_compliant_month_at_risk", scope: "fa-1:2026-12" },
    ]);
  });

  it("does not clear the warning it is observing", async () => {
    const alerts = new FakeSecondMonthRiskAlerts(["fa-1:2026-11"]);

    const { alerts: observed, outcome } = detect({
      today: "2026-11-20",
      breaches: [recorded("fa-1", "2026-10")],
      counts: [running("fa-1", "2026-11", 1, 50)],
      alerts,
    });

    expect(await outcome).toBe(1);
    expect(observed.observations.map((each) => each.holds)).toEqual([true]);
  });

  it("warns in January about a recorded December", async () => {
    const { alerts, outcome } = detect({
      today: "2027-01-15",
      breaches: [recorded("fa-1", "2026-12")],
      counts: [running("fa-1", "2027-01", 2, 40)],
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([
      held("fa-1", "2027-01", "2026-12", {
        exceptionCount: 2,
        totalCount: 40,
        exceptionShareTenthsOfPercent: 50,
      }),
    ]);
  });

  it("warns without a share while the address has no vouchers in the month", async () => {
    const { alerts, outcome } = detect({
      today: "2026-11-01",
      breaches: [recorded("fa-1", "2026-10")],
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([
      held("fa-1", "2026-11", "2026-10", {
        exceptionCount: 0,
        totalCount: 0,
        exceptionShareTenthsOfPercent: null,
      }),
    ]);
  });

  it("warns each address on its own figures and not another address", async () => {
    const { alerts, outcome } = detect({
      today: "2026-11-10",
      breaches: [recorded("fa-1", "2026-10"), recorded("fa-2", "2026-09")],
      counts: [running("fa-1", "2026-11", 1, 100), running("fa-2", "2026-11", 9, 100)],
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([
      held("fa-1", "2026-11", "2026-10", {
        exceptionCount: 1,
        totalCount: 100,
        exceptionShareTenthsOfPercent: 10,
      }),
    ]);
  });

  it("takes the running figures of the address even when another address is counted first", async () => {
    const { alerts, outcome } = detect({
      today: "2026-11-10",
      breaches: [recorded("fa-1", "2026-10")],
      counts: [running("fa-2", "2026-11", 9, 100), running("fa-1", "2026-11", 1, 50)],
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([
      held("fa-1", "2026-11", "2026-10", {
        exceptionCount: 1,
        totalCount: 50,
        exceptionShareTenthsOfPercent: 20,
      }),
    ]);
  });

  describe("on either measurement", () => {
    const runs = availableSince("2026-10-01", "2026-11-10");
    const address = [{ fiscalAddressId: "fa-1", fiscalAddressName: "Address fa-1" }];

    it("warns when the previous month is non-compliant only for its time in contingency", async () => {
      const { alerts, outcome } = detect({
        today: "2026-11-10",
        addresses: address,
        runs,
        contingency: new Map([contingencyOf("fa-1", "2026-10-05", 40)]),
        counts: [running("fa-1", "2026-11", 1, 100)],
      });

      expect(await outcome).toBe(1);
      expect(alerts.observations).toEqual([
        held("fa-1", "2026-11", "2026-10", {
          exceptionCount: 1,
          totalCount: 100,
          exceptionShareTenthsOfPercent: 10,
          previousMonthNonCompliantOn: ["contingency_time"],
          contingencyShareTenthsOfPercent: 0,
        }),
      ]);
    });

    it("warns when the previous month is non-compliant only for its exception share", async () => {
      const { alerts, outcome } = detect({
        today: "2026-11-10",
        breaches: [recorded("fa-1", "2026-10")],
        runs,
        contingency: new Map([contingencyOf("fa-1", "2026-10-05", 10)]),
      });

      expect(await outcome).toBe(1);
      expect(alerts.observations).toMatchObject([
        { alert: { detail: { previousMonthNonCompliantOn: ["exception_share"] } } },
      ]);
    });

    it("lists both measurements when the previous month failed both", async () => {
      const { alerts, outcome } = detect({
        today: "2026-11-10",
        breaches: [recorded("fa-1", "2026-10")],
        runs,
        contingency: new Map([contingencyOf("fa-1", "2026-10-05", 40)]),
      });

      expect(await outcome).toBe(1);
      expect(alerts.observations).toMatchObject([
        {
          alert: {
            detail: { previousMonthNonCompliantOn: ["exception_share", "contingency_time"] },
          },
        },
      ]);
    });

    it("does not warn when the previous month is exactly at the contingency limit", async () => {
      const { alerts, outcome } = detect({
        today: "2026-11-10",
        addresses: address,
        runs,
        contingency: new Map([contingencyOf("fa-1", "2026-10-05", 36.6)]),
      });

      expect(await outcome).toBe(0);
      expect(alerts.observations).toEqual([]);
    });

    it("does not warn when the previous month is compliant on both, however far the current month runs", async () => {
      const { alerts, outcome } = detect({
        today: "2026-11-10",
        addresses: address,
        runs,
        contingency: new Map([contingencyOf("fa-1", "2026-11-02", 100)]),
        counts: [running("fa-1", "2026-11", 9, 100)],
      });

      expect(await outcome).toBe(0);
      expect(alerts.observations).toEqual([]);
    });

    it("shows no share of time in contingency while the month in progress has no data", async () => {
      const { alerts, outcome } = detect({
        today: "2026-11-10",
        breaches: [recorded("fa-1", "2026-10")],
      });

      expect(await outcome).toBe(1);
      expect(alerts.observations).toMatchObject([
        { alert: { detail: { contingencyShareTenthsOfPercent: null } } },
      ]);
    });

    it("warns about a second month after an exception breach while contingency runs past its limit", async () => {
      const { alerts, outcome } = detect({
        today: "2026-11-10",
        breaches: [recorded("fa-1", "2026-10")],
        runs,
        contingency: new Map([contingencyOf("fa-1", "2026-11-02", 22.8)]),
        counts: [running("fa-1", "2026-11", 2, 100)],
      });

      expect(await outcome).toBe(1);
      expect(alerts.observations).toEqual([
        held("fa-1", "2026-11", "2026-10", {
          exceptionCount: 2,
          totalCount: 100,
          exceptionShareTenthsOfPercent: 20,
          previousMonthNonCompliantOn: ["exception_share"],
          contingencyShareTenthsOfPercent: 100,
        }),
      ]);
    });

    it("warns about a second month after a contingency breach while the exception share runs past its limit", async () => {
      const { alerts, outcome } = detect({
        today: "2026-11-10",
        addresses: address,
        runs,
        contingency: new Map([contingencyOf("fa-1", "2026-10-05", 40)]),
        counts: [running("fa-1", "2026-11", 7, 100)],
      });

      expect(await outcome).toBe(1);
      expect(alerts.observations).toEqual([
        held("fa-1", "2026-11", "2026-10", {
          exceptionCount: 7,
          totalCount: 100,
          exceptionShareTenthsOfPercent: 70,
          previousMonthNonCompliantOn: ["contingency_time"],
          contingencyShareTenthsOfPercent: 0,
        }),
      ]);
    });

    it("measures each address on its own contingency and reads availability once per window", async () => {
      const { alerts, outcome, risks } = detect({
        today: "2026-11-10",
        addresses: [
          { fiscalAddressId: "fa-1", fiscalAddressName: "Address fa-1" },
          { fiscalAddressId: "fa-2", fiscalAddressName: "Address fa-2" },
        ],
        runs,
        contingency: new Map([contingencyOf("fa-2", "2026-10-05", 40)]),
      });

      expect(await outcome).toBe(1);
      expect(alerts.observations).toMatchObject([{ alert: { scope: "fa-2:2026-11" } }]);
      expect(risks.availabilityWindows).toHaveLength(2);
    });
  });

  it("reads the day in Argentina, not in UTC", async () => {
    const alerts = new FakeSecondMonthRiskAlerts();
    const outcome = detectSecondNonCompliantMonthRisks({
      risks: new FakeSecondMonthRiskReader({ breaches: [recorded("fa-1", "2026-10")] }),
      alerts,
      clock: new FixedClock(new Date("2026-12-01T01:00:00Z")),
      zoneRules: new FakeZoneRulesSource(),
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toMatchObject([{ alert: { detail: { month: "2026-11" } } }]);
  });
});
