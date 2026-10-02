import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { stockKey, stockKeys } from "./stock-queries";

test("invalidating the stock key marks every stock read stale", async () => {
  const client = new QueryClient();
  const keys = [
    stockKeys.balances,
    stockKeys.counts(30),
    stockKeys.counts(7),
    stockKeys.movements(90),
    stockKeys.movementReasons,
    stockKeys.expectedBalance("product-1", "2026-09-15T21:32:00.000Z"),
  ];
  for (const key of keys) {
    client.setQueryData(key, []);
  }
  client.setQueryData(["prices"], []);

  await client.invalidateQueries({ queryKey: stockKey, refetchType: "none" });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryState(["prices"])?.isInvalidated).toBe(false);
});

test("each period, product and moment has its own key", () => {
  const keys = [
    stockKeys.counts(7),
    stockKeys.counts(30),
    stockKeys.movements(7),
    stockKeys.movements(30),
    stockKeys.expectedBalance("product-1", "2026-09-15T21:32:00.000Z"),
    stockKeys.expectedBalance("product-2", "2026-09-15T21:32:00.000Z"),
    stockKeys.expectedBalance("product-1", "2026-09-15T21:33:00.000Z"),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});
