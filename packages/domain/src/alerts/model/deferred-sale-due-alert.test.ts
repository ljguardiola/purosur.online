import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import {
  deferredSaleDueObservation,
  deferredSaleNoLongerDueObservation,
} from "./deferred-sale-due-alert.js";

const sale = {
  id: "deferred-sale-1",
  saleId: "sale-1",
  registerId: "register-1",
  locationId: "branch-1",
  occurredAt: new Date("2026-10-10T15:00:00.000Z"),
  total: 1234500,
  shortCode: "ABCD2345",
};

const detail = {
  registerId: "register-1",
  saleId: "sale-1",
  saleOccurredAt: "2026-10-10T15:00:00.000Z",
  total: 1234500,
  shortCode: "ABCD2345",
  expiresOn: "2026-10-15",
  escalatesAt: "2026-10-14T03:00:00.000Z",
};

describe("deferredSaleDueObservation", () => {
  it("holds a warning scoped to the deferred sale while it is due", () => {
    expect(deferredSaleDueObservation(sale, { kind: "due" }, FIXED_ARGENTINA_ZONE_RULES)).toEqual({
      holds: true,
      level: "warning",
      alert: {
        kind: "deferred_sale_due",
        scope: "deferred-sale-1",
        locationId: "branch-1",
        detail,
      },
    });
  });

  it("holds the same alert at the critical level once it is pressing", () => {
    expect(
      deferredSaleDueObservation(sale, { kind: "pressing" }, FIXED_ARGENTINA_ZONE_RULES),
    ).toEqual({
      holds: true,
      level: "critical",
      alert: {
        kind: "deferred_sale_due",
        scope: "deferred-sale-1",
        locationId: "branch-1",
        detail,
      },
    });
  });

  it("names the month-end expiry and the escalation of a sale made near the end of its month", () => {
    const lateSale = { ...sale, occurredAt: new Date("2026-10-28T15:00:00.000Z") };

    expect(
      deferredSaleDueObservation(lateSale, { kind: "due" }, FIXED_ARGENTINA_ZONE_RULES),
    ).toMatchObject({
      alert: {
        detail: {
          saleOccurredAt: "2026-10-28T15:00:00.000Z",
          expiresOn: "2026-10-31",
          escalatesAt: "2026-10-30T03:00:00.000Z",
        },
      },
    });
  });
});

describe("deferredSaleNoLongerDueObservation", () => {
  it("clears the due condition of the deferred sale", () => {
    expect(deferredSaleNoLongerDueObservation("deferred-sale-1")).toEqual({
      holds: false,
      kind: "deferred_sale_due",
      scope: "deferred-sale-1",
    });
  });
});
