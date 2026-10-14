import { expect, test } from "vitest";
import {
  assemblyBatchesCountText,
  batchDayText,
  batchExpiryText,
  batchUnitCostText,
} from "./assembly-batch-text";

test("writes a known unit cost per kilo for a product sold by weight", () => {
  expect(batchUnitCostText({ unitCostCents: 991_200, costIncomplete: false }, "KG")).toBe(
    "$ 9.912,00 / kg",
  );
});

test("writes a known unit cost of a product sold by unit without a unit suffix", () => {
  expect(batchUnitCostText({ unitCostCents: 12_000, costIncomplete: false }, "UNIT")).toBe(
    "$ 120,00",
  );
});

test.each([
  [{ unitCostCents: null, costIncomplete: true }],
  [{ unitCostCents: null, costIncomplete: false }],
  [{ unitCostCents: 500, costIncomplete: true }],
])("has no unit cost text when the cost is incomplete or unknown: %j", (cost) => {
  expect(batchUnitCostText(cost, "KG")).toBeNull();
});

test("names a batch by the day it was assembled in Argentina", () => {
  expect(batchDayText("2026-09-15T13:30:00.000Z")).toBe("Tanda del 15/09/2026");
  expect(batchDayText("2026-09-16T01:30:00.000Z")).toBe("Tanda del 15/09/2026");
});

test("writes the expiry day, or says the batch does not expire", () => {
  expect(batchExpiryText("2026-11-02")).toBe("02/11/2026");
  expect(batchExpiryText(null)).toBe("Sin vencimiento");
});

test.each([
  [1, 30, "1 tanda en los últimos 30 días"],
  [3, 7, "3 tandas en los últimos 7 días"],
  [12, 90, "12 tandas en los últimos 90 días"],
])("counts %i batches over %i days", (count, days, text) => {
  expect(assemblyBatchesCountText(count, days)).toBe(text);
});
