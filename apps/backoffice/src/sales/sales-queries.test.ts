import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { salesKey, salesKeys } from "./sales-queries";
import { FRONT_REGISTER_ID } from "./test-support/sales-fixtures";

test("invalidating the sales key marks every sales read stale", async () => {
  const client = new QueryClient();
  const keys = [salesKeys.report({}), salesKeys.registers, salesKeys.pendingRefunds];
  for (const key of keys) {
    client.setQueryData(key, []);
  }
  client.setQueryData(["stock"], []);

  await client.invalidateQueries({ queryKey: salesKey, refetchType: "none" });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryState(["stock"])?.isInvalidated).toBe(false);
});

test("each range and register has its own key", () => {
  const keys = [
    salesKeys.report({}),
    salesKeys.report({ from: "2026-10-01", to: "2026-10-07" }),
    salesKeys.report({ from: "2026-10-01", to: "2026-10-08" }),
    salesKeys.report({ register_id: FRONT_REGISTER_ID }),
    salesKeys.report({ from: "2026-10-01", to: "2026-10-07", register_id: FRONT_REGISTER_ID }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});
