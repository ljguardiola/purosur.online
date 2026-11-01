import { describe, expect, it } from "vitest";
import type { RecordedExceptionShareBreach } from "../../fiscal/index.js";
import { detectExceptionShareBreaches } from "./detect-exception-share-breaches.js";
import {
  FakeExceptionShareBreachAlerts,
  FakeRecordedExceptionShareBreachReader,
} from "./test-support/fake-exception-share-breaches.js";

function breach(
  fiscalAddressId: string,
  month: string,
  exceptionCount = 6,
  totalCount = 100,
): RecordedExceptionShareBreach {
  return {
    fiscalAddressId,
    fiscalAddressName: `Address ${fiscalAddressId}`,
    month,
    exceptionCount,
    totalCount,
  };
}

function detect(
  breaches: RecordedExceptionShareBreach[],
  alerts = new FakeExceptionShareBreachAlerts(),
) {
  return {
    alerts,
    outcome: detectExceptionShareBreaches({
      breaches: new FakeRecordedExceptionShareBreachReader(breaches),
      alerts,
    }),
  };
}

describe("detectExceptionShareBreaches", () => {
  it("opens nothing when no month is recorded", async () => {
    const { alerts, outcome } = detect([]);

    expect(await outcome).toBe(0);
    expect(alerts.opened).toEqual([]);
  });

  it("opens the alert of a recorded month with its figures and the year's ordered list", async () => {
    const { alerts, outcome } = detect([
      breach("fa-1", "2026-09", 7, 120),
      breach("fa-1", "2026-02"),
    ]);

    expect(await outcome).toBe(2);
    expect(alerts.opened).toEqual([
      {
        kind: "exception_share_breach",
        scope: "fa-1:2026-09",
        detail: {
          fiscalAddressId: "fa-1",
          fiscalAddressName: "Address fa-1",
          month: "2026-09",
          exceptionCount: 7,
          totalCount: 120,
          nonCompliantMonths: ["2026-02", "2026-09"],
        },
      },
      {
        kind: "exception_share_breach",
        scope: "fa-1:2026-02",
        detail: {
          fiscalAddressId: "fa-1",
          fiscalAddressName: "Address fa-1",
          month: "2026-02",
          exceptionCount: 6,
          totalCount: 100,
          nonCompliantMonths: ["2026-02", "2026-09"],
        },
      },
    ]);
  });

  it("keeps the months of another fiscal address and of another year out of the list", async () => {
    const { alerts, outcome } = detect([
      breach("fa-1", "2026-09"),
      breach("fa-2", "2026-03"),
      breach("fa-1", "2025-12"),
    ]);

    await outcome;

    expect(alerts.opened[0]?.detail).toMatchObject({ nonCompliantMonths: ["2026-09"] });
  });

  it("does not open the alert of a month again", async () => {
    const { alerts, outcome } = detect(
      [breach("fa-1", "2026-09"), breach("fa-1", "2026-10")],
      new FakeExceptionShareBreachAlerts(["fa-1:2026-09"]),
    );

    expect(await outcome).toBe(1);
    expect(alerts.opened.map((each) => each.scope)).toEqual(["fa-1:2026-10"]);
  });

  it("does not reopen the alert a person already closed", async () => {
    const alerts = new FakeExceptionShareBreachAlerts();
    const first = detect([breach("fa-1", "2026-09")], alerts);
    await first.outcome;

    const second = detect([breach("fa-1", "2026-09", 8, 110)], alerts);

    expect(await second.outcome).toBe(0);
    expect(alerts.opened).toHaveLength(1);
  });
});
