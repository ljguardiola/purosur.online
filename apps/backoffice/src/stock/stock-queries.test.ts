import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { stockKey, stockKeys } from "./stock-queries";

test("invalidating the stock key marks every stock read stale", async () => {
  const client = new QueryClient();
  const keys = [
    stockKeys.balances,
    stockKeys.expiringLots,
    stockKeys.counts(30),
    stockKeys.counts(7),
    stockKeys.movements(90),
    stockKeys.movementReasons,
    stockKeys.expectedBalance("product-1", "2026-09-15T21:32:00.000Z"),
    stockKeys.initialLots({}),
    stockKeys.initialLots({ cost: "known", product: "miel" }),
  ];
  for (const key of keys) {
    client.setQueryData(key, []);
  }
  client.setQueryData(["pricing"], []);

  await client.invalidateQueries({ queryKey: stockKey, refetchType: "none" });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryState(["pricing"])?.isInvalidated).toBe(false);
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
    stockKeys.initialLots({}),
    stockKeys.initialLots({ cost: "known" }),
    stockKeys.initialLots({ cost: "incomplete" }),
    stockKeys.initialLots({ product: "miel" }),
    stockKeys.initialLots({ cost: "known", product: "miel" }),
    stockKeys.assemblyBatches(7),
    stockKeys.assemblyBatches(30),
    stockKeys.assemblyBatchProposal({ productId: "p-1", size: 5_000 }),
    stockKeys.assemblyBatchProposal({ productId: "p-1", size: 6_000 }),
    stockKeys.assemblyBatchProposal({ productId: "p-2", size: 5_000 }),
    stockKeys.assemblyBatchLot({ productId: "p-1", size: 5_000, used: [], output: 4_900 }),
    stockKeys.assemblyBatchLot({ productId: "p-1", size: 5_000, used: [], output: 4_800 }),
    stockKeys.assemblyBatchLot({
      productId: "p-1",
      size: 5_000,
      used: [{ componentProductId: "c-1", quantity: 100 }],
      output: 4_900,
    }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});
