import { describe, expect, test } from "vitest";
import { formatPurchaseOrderCreatedDay, formatPurchaseOrderSentDay } from "./purchase-order-day";

describe("formatPurchaseOrderCreatedDay", () => {
  test("shows the day in Argentina of an order created late at night there", () => {
    expect(formatPurchaseOrderCreatedDay("2026-03-10T01:30:00.000Z")).toBe("09/03/2026");
  });

  test("shows the next day once midnight has passed in Argentina", () => {
    expect(formatPurchaseOrderCreatedDay("2026-03-10T03:00:00.000Z")).toBe("10/03/2026");
  });
});

describe("formatPurchaseOrderSentDay", () => {
  test("shows the day in Argentina of an order sent late at night there", () => {
    expect(formatPurchaseOrderSentDay("2026-10-08T01:30:00.000Z")).toBe("07/10/2026");
  });

  test("shows the next day once midnight has passed in Argentina", () => {
    expect(formatPurchaseOrderSentDay("2026-10-08T03:00:00.000Z")).toBe("08/10/2026");
  });
});
