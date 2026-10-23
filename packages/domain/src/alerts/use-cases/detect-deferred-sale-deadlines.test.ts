import { describe, expect, it } from "vitest";
import type { PendingDeferredSale } from "../../fiscal/index.js";
import { argentinaInstant } from "../../shared/index.js";
import { detectDeferredSaleDeadlines } from "./detect-deferred-sale-deadlines.js";
import { FixedClock } from "./test-support/fake-alert-store.js";
import { FakeDeferredSaleDeadlineAlerts } from "./test-support/fake-deferred-sale-deadlines.js";

function at(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time));
}

function pendingSale(
  id: string,
  occurredAt: Date,
  overrides: Partial<PendingDeferredSale> = {},
): PendingDeferredSale {
  return {
    id,
    saleId: `sale-of-${id}`,
    registerId: "register-1",
    locationId: "branch-1",
    occurredAt,
    total: 250000,
    shortCode: "ABCD2345",
    ...overrides,
  };
}

function detect(
  sales: PendingDeferredSale[],
  moment: Date,
  alerts = new FakeDeferredSaleDeadlineAlerts(),
) {
  const outcome = detectDeferredSaleDeadlines({ alerts, clock: new FixedClock(moment) }, sales);
  return { alerts, outcome };
}

function held(level: string, id: string, detail: Record<string, unknown>) {
  return {
    holds: true,
    level,
    alert: {
      kind: "deferred_sale_due",
      scope: id,
      locationId: "branch-1",
      detail: {
        registerId: "register-1",
        saleId: `sale-of-${id}`,
        total: 250000,
        shortCode: "ABCD2345",
        ...detail,
      },
    },
  };
}

function cleared(scope: string) {
  return { holds: false, kind: "deferred_sale_due", scope };
}

describe("detectDeferredSaleDeadlines", () => {
  const sale = pendingSale("sale-1", at("2026-10-10"));
  const detail = {
    saleOccurredAt: at("2026-10-10").toISOString(),
    expiresOn: "2026-10-15",
    escalatesAt: at("2026-10-14", "00:00").toISOString(),
  };

  it("opens nothing for a sale still within its first three days", async () => {
    const { alerts, outcome } = detect([sale], new Date("2026-10-12T23:59:59.999-03:00"));

    expect(await outcome).toBe(0);
    expect(alerts.observations).toEqual([]);
  });

  it("opens a warning when three days have passed since the sale date", async () => {
    const { alerts, outcome } = detect([sale], at("2026-10-13", "00:00"));

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([held("warning", "sale-1", detail)]);
  });

  it("escalates it to critical one day later", async () => {
    const { alerts, outcome } = detect([sale], at("2026-10-14", "00:00"));

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([held("critical", "sale-1", detail)]);
  });

  it("keeps it critical through the last instant of the expiry day", async () => {
    const { alerts, outcome } = detect([sale], new Date("2026-10-15T23:59:59.999-03:00"));
    await outcome;

    expect(alerts.observations).toEqual([held("critical", "sale-1", detail)]);
  });

  it("opens and escalates earlier for a sale made near the end of its month", async () => {
    const lateSale = pendingSale("late", at("2026-10-26"));
    const lateDetail = {
      saleOccurredAt: at("2026-10-26").toISOString(),
      expiresOn: "2026-10-31",
      escalatesAt: at("2026-10-30", "00:00").toISOString(),
    };

    const opening = detect([lateSale], at("2026-10-29", "00:00"));
    const escalating = detect([lateSale], at("2026-10-30", "00:00"));
    await Promise.all([opening.outcome, escalating.outcome]);

    expect(opening.alerts.observations).toEqual([held("warning", "late", lateDetail)]);
    expect(escalating.alerts.observations).toEqual([held("critical", "late", lateDetail)]);
  });

  it("holds a sale made on the last day of its month at once, as critical", async () => {
    const lastDay = pendingSale("last", at("2026-10-31", "18:00"));

    const { alerts, outcome } = detect([lastDay], at("2026-10-31", "18:00"));

    expect(await outcome).toBe(1);
    expect(alerts.observations).toEqual([
      held("critical", "last", {
        saleOccurredAt: at("2026-10-31", "18:00").toISOString(),
        expiresOn: "2026-10-31",
        escalatesAt: at("2026-10-31", "18:00").toISOString(),
      }),
    ]);
  });

  it("holds nothing for a sale past its expiry and clears the alert it had", async () => {
    const { alerts, outcome } = detect(
      [sale],
      at("2026-10-16", "00:00"),
      new FakeDeferredSaleDeadlineAlerts(["sale-1"]),
    );

    expect(await outcome).toBe(0);
    expect(alerts.observations).toEqual([cleared("sale-1")]);
  });

  it.each(["satisfied", "voided", "regularized"])(
    "clears the alert of a sale that is no longer pending once %s",
    async (_ending) => {
      const { alerts, outcome } = detect(
        [],
        at("2026-10-14"),
        new FakeDeferredSaleDeadlineAlerts(["sale-1"]),
      );

      expect(await outcome).toBe(0);
      expect(alerts.observations).toEqual([cleared("sale-1")]);
    },
  );

  it("clears only the alerts of sales not held in this pass", async () => {
    const other = pendingSale("sale-2", at("2026-10-10"));
    const { alerts, outcome } = detect(
      [other],
      at("2026-10-14"),
      new FakeDeferredSaleDeadlineAlerts(["sale-1", "sale-2"]),
    );

    expect(await outcome).toBe(1);
    expect(alerts.observations.map((observation) => observation.holds)).toEqual([true, false]);
    expect(alerts.observations[1]).toEqual(cleared("sale-1"));
  });

  it("clears nothing when no alert is open and no sale is due", async () => {
    const { alerts, outcome } = detect([sale], at("2026-10-11"));

    expect(await outcome).toBe(0);
    expect(alerts.observations).toEqual([]);
  });
});
