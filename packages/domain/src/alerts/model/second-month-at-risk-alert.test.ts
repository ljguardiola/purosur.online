import { describe, expect, it } from "vitest";
import {
  secondMonthAtRiskObservation,
  secondMonthNoLongerAtRiskObservation,
} from "./second-month-at-risk-alert.js";

const MEASUREMENTS = {
  previousMonthNonCompliantOn: ["exception_share" as const, "contingency_time" as const],
  contingencyShareTenthsOfPercent: 62,
};

const ADDRESS = { fiscalAddressId: "fa-1", fiscalAddressName: "Local central" };

describe("secondMonthAtRiskObservation", () => {
  it("holds for the address and the month in progress with the running figures and the threshold", () => {
    expect(
      secondMonthAtRiskObservation(
        ADDRESS,
        "2026-11",
        "2026-10",
        {
          exceptionCount: 3,
          totalCount: 80,
        },
        MEASUREMENTS,
      ),
    ).toEqual({
      holds: true,
      alert: {
        kind: "exception_share_second_month_at_risk",
        scope: "fa-1:2026-11",
        detail: {
          fiscalAddressId: "fa-1",
          fiscalAddressName: "Local central",
          month: "2026-11",
          previousMonth: "2026-10",
          exceptionCount: 3,
          totalCount: 80,
          shareTenthsOfPercent: 37,
          nonCompliancePercent: 5,
          previousMonthNonCompliantOn: ["exception_share", "contingency_time"],
          contingencyShareTenthsOfPercent: 62,
          contingencyNonCompliancePercent: 5,
        },
      },
    });
  });

  it("carries no share while the month has no vouchers", () => {
    const observation = secondMonthAtRiskObservation(
      ADDRESS,
      "2026-11",
      "2026-10",
      { exceptionCount: 0, totalCount: 0 },
      MEASUREMENTS,
    );

    expect(observation).toMatchObject({
      alert: { detail: { exceptionCount: 0, totalCount: 0, shareTenthsOfPercent: null } },
    });
  });
});

it("carries no contingency share while the month in progress has no data", () => {
  const observation = secondMonthAtRiskObservation(
    ADDRESS,
    "2026-11",
    "2026-10",
    { exceptionCount: 3, totalCount: 80 },
    { ...MEASUREMENTS, contingencyShareTenthsOfPercent: null },
  );

  expect(observation).toMatchObject({
    alert: { detail: { contingencyShareTenthsOfPercent: null } },
  });
});

describe("secondMonthNoLongerAtRiskObservation", () => {
  it("no longer holds for the scope", () => {
    expect(secondMonthNoLongerAtRiskObservation("fa-1:2026-10")).toEqual({
      holds: false,
      kind: "exception_share_second_month_at_risk",
      scope: "fa-1:2026-10",
    });
  });
});
