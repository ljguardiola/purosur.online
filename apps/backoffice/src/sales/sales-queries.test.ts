import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { salesKey, salesKeys } from "./sales-queries";

test("invalidating the sales key marks every sales read stale", async () => {
  const client = new QueryClient();
  client.setQueryData(salesKeys.report({}), []);
  client.setQueryData(salesKeys.productsAndCategories({ group: "category" }), []);
  client.setQueryData(["stock"], []);

  await client.invalidateQueries({ queryKey: salesKey, refetchType: "none" });

  expect(client.getQueryState(salesKeys.report({}))?.isInvalidated).toBe(true);
  expect(
    client.getQueryState(salesKeys.productsAndCategories({ group: "category" }))?.isInvalidated,
  ).toBe(true);
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

test("each grouping, range and register has its own sales by product and category key", () => {
  const keys = [
    salesKeys.productsAndCategories({ group: "category" }),
    salesKeys.productsAndCategories({ group: "product" }),
    salesKeys.productsAndCategories({ group: "category", from: "2026-10-01", to: "2026-10-07" }),
    salesKeys.productsAndCategories({ group: "category", from: "2026-10-01", to: "2026-10-08" }),
    salesKeys.productsAndCategories({ group: "category", register_id: FRONT_REGISTER_ID }),
    salesKeys.report({ register_id: FRONT_REGISTER_ID }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});
