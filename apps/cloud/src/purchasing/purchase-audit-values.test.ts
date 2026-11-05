import type { PurchaseCorrectionChange } from "@purosur/domain/purchasing/use-cases";
import { describe, expect, it } from "vitest";
import { auditValuesOf, changeOfAuditValues } from "./purchase-audit-values.js";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const LINE_ID = "33333333-3333-4333-8333-333333333333";

describe("the audit values of a purchase line's product change", () => {
  const change: PurchaseCorrectionChange = {
    kind: "line_product",
    lineId: LINE_ID,
    previous: PRODUCT_ID,
    next: OTHER_PRODUCT_ID,
  };

  it("keeps the previous and the new product, each with the line", () => {
    expect(auditValuesOf(change)).toEqual({
      previousValue: { kind: "line_product", lineId: LINE_ID, productId: PRODUCT_ID },
      newValue: { kind: "line_product", lineId: LINE_ID, productId: OTHER_PRODUCT_ID },
    });
  });

  it("reads the change back from what it kept", () => {
    const { previousValue, newValue } = auditValuesOf(change);

    expect(changeOfAuditValues(previousValue, newValue)).toEqual(change);
  });
});

describe.each([
  ["a line loaded by quantity", null, "2026-11-10"],
  ["a line loaded by packages", 2, null],
])("the audit values of the removal of %s", (_name, packages, expiresOn) => {
  const change: PurchaseCorrectionChange = {
    kind: "line_removed",
    lineId: LINE_ID,
    productId: PRODUCT_ID,
    quantity: 12_000,
    packages,
    costPaidCents: 2_500,
    expiresOn,
  };

  it("keeps what the line was in the previous value and the line alone in the new one", () => {
    expect(auditValuesOf(change)).toEqual({
      previousValue: {
        kind: "line_removed",
        lineId: LINE_ID,
        productId: PRODUCT_ID,
        quantity: 12_000,
        packages,
        costPaidCents: 2_500,
        expiresOn,
      },
      newValue: { kind: "line_removed", lineId: LINE_ID },
    });
  });

  it("reads the removal back from what it kept", () => {
    const { previousValue, newValue } = auditValuesOf(change);

    expect(changeOfAuditValues(previousValue, newValue)).toEqual(change);
  });
});
