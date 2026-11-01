import { describe, expect, it } from "vitest";
import {
  exceptionShareBreachAlert,
  fiscalAddressMonthScope,
  fiscalAddressMonthScopeDisplay,
  fiscalAddressMonthScopeFiscalAddressId,
} from "./exception-share-alerts.js";

const BREACH = {
  fiscalAddressId: "fa-1",
  fiscalAddressName: "Local central",
  month: "2026-09",
  exceptionCount: 7,
  totalCount: 120,
};

describe("fiscalAddressMonthScope", () => {
  it("names a fiscal address and a month", () => {
    expect(fiscalAddressMonthScope("fa-1", "2026-09")).toBe("fa-1:2026-09");
  });

  it("tells apart two months of an address and two addresses in a month", () => {
    const scopes = [
      fiscalAddressMonthScope("fa-1", "2026-09"),
      fiscalAddressMonthScope("fa-1", "2026-10"),
      fiscalAddressMonthScope("fa-2", "2026-09"),
    ];

    expect(new Set(scopes).size).toBe(3);
  });
});

describe("fiscalAddressMonthScopeFiscalAddressId", () => {
  it("reads the fiscal address back from the scope of an address and a month", () => {
    expect(fiscalAddressMonthScopeFiscalAddressId(fiscalAddressMonthScope("fa-1", "2026-09"))).toBe(
      "fa-1",
    );
  });

  it("reads nothing from a scope without a month", () => {
    expect(fiscalAddressMonthScopeFiscalAddressId("fa-1")).toBeUndefined();
    expect(fiscalAddressMonthScopeFiscalAddressId("fa-1:september")).toBeUndefined();
    expect(fiscalAddressMonthScopeFiscalAddressId(":2026-09")).toBeUndefined();
  });
});

describe("fiscalAddressMonthScopeDisplay", () => {
  it("puts the name of the fiscal address before the month of the scope", () => {
    expect(fiscalAddressMonthScopeDisplay("fa-1:2026-09", "Local central")).toBe(
      "Local central:2026-09",
    );
  });

  it("keeps the scope as it comes when it holds no month", () => {
    expect(fiscalAddressMonthScopeDisplay("fa-1", "Local central")).toBe("fa-1");
  });
});

describe("exceptionShareBreachAlert", () => {
  it("opens the alert of the fiscal address and month with what a person needs to act on it", () => {
    expect(exceptionShareBreachAlert(BREACH, ["2026-09"])).toEqual({
      kind: "exception_share_breach",
      scope: "fa-1:2026-09",
      detail: {
        fiscalAddressId: "fa-1",
        fiscalAddressName: "Local central",
        month: "2026-09",
        exceptionCount: 7,
        totalCount: 120,
        nonCompliantMonths: ["2026-09"],
      },
    });
  });

  it("carries the ordered non-compliant months of the breach's year only", () => {
    const alert = exceptionShareBreachAlert(BREACH, ["2026-09", "2025-12", "2026-03", "2027-01"]);

    expect(alert.detail).toMatchObject({ nonCompliantMonths: ["2026-03", "2026-09"] });
  });
});
