import { describe, expect, it } from "vitest";
import type { RecordedExceptionShareBreach } from "../../fiscal/index.js";
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

function detect({
  today,
  breaches = [],
  counts = [],
  alerts = new FakeSecondMonthRiskAlerts(),
}: {
  today: string;
  breaches?: RecordedExceptionShareBreach[];
  counts?: ReturnType<typeof running>[];
  alerts?: FakeSecondMonthRiskAlerts;
}) {
  const outcome = detectSecondNonCompliantMonthRisks({
    risks: new FakeSecondMonthRiskReader(breaches, counts),
    alerts,
    clock: new FixedClock(at(today)),
    zoneRules: new FakeZoneRulesSource(),
  });
  return { alerts, outcome };
}

function held(
  fiscalAddressId: string,
  month: string,
  previousMonth: string,
  figures: { exceptionCount: number; totalCount: number; shareTenthsOfPercent: number | null },
) {
  return {
    holds: true,
    alert: {
      kind: "exception_share_second_month_at_risk",
      scope: `${fiscalAddressId}:${month}`,
      detail: {
        fiscalAddressId,
        fiscalAddressName: `Address ${fiscalAddressId}`,
        month,
        previousMonth,
        nonCompliancePercent: 5,
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
        shareTenthsOfPercent: 37,
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
      held("fa-1", "2026-12", "2026-11", { exceptionCount: 0, totalCount: 0, shareTenthsOfPercent: null }),
      { holds: false, kind: "exception_share_second_month_at_risk", scope: "fa-1:2026-11" },
    ]);
  });

  it("clears the warning of an address whose previous month is no longer recorded at all", async () => {
    const alerts = new FakeSecondMonthRiskAlerts(["fa-1:2026-12"]);

    const { outcome } = detect({ today: "2027-01-05", alerts });

    expect(await outcome).toBe(0);
    expect(alerts.observations).toEqual([
      { holds: false, kind: "exception_share_second_month_at_risk", scope: "fa-1:2026-12" },
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
      held("fa-1", "2027-01", "2026-12", { exceptionCount: 2, totalCount: 40, shareTenthsOfPercent: 50 }),
    ]);
  });

  it("warns without a share while the address has no vouchers in the month", async () => {
    const { alerts, outcome } = detect({
      today: "2026-11-01",
      breaches: [recorded("fa-1", "2026-10")],
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([
      held("fa-1", "2026-11", "2026-10", { exceptionCount: 0, totalCount: 0, shareTenthsOfPercent: null }),
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
      held("fa-1", "2026-11", "2026-10", { exceptionCount: 1, totalCount: 100, shareTenthsOfPercent: 10 }),
    ]);
  });

  it("reads the day in Argentina, not in UTC", async () => {
    const alerts = new FakeSecondMonthRiskAlerts();
    const outcome = detectSecondNonCompliantMonthRisks({
      risks: new FakeSecondMonthRiskReader([recorded("fa-1", "2026-10")]),
      alerts,
      clock: new FixedClock(new Date("2026-12-01T01:00:00Z")),
      zoneRules: new FakeZoneRulesSource(),
    });

    expect(await outcome).toBe(1);
    expect(alerts.observations).toMatchObject([{ alert: { detail: { month: "2026-11" } } }]);
  });
});
