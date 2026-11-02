import { describe, expect, test } from "vitest";
import { formatPurchaseOrderCreatedDay } from "./purchase-order-created-day";

describe("formatPurchaseOrderCreatedDay", () => {
  test("shows the day in Argentina of an order created late at night there", () => {
    expect(formatPurchaseOrderCreatedDay("2026-03-10T01:30:00.000Z")).toBe("09/03/2026");
  });

  test("shows the next day once midnight has passed in Argentina", () => {
    expect(formatPurchaseOrderCreatedDay("2026-03-10T03:00:00.000Z")).toBe("10/03/2026");
  });
});
