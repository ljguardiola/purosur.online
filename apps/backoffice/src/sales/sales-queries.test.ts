import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { salesKey, salesKeys } from "./sales-queries";
import { ANA_USER_ID } from "./test-support/sales-fixtures";

test("invalidating the sales key marks every sales read stale", async () => {
  const client = new QueryClient();
  client.setQueryData(salesKeys.report({}), []);
  client.setQueryData(salesKeys.productsAndCategories({ group: "category" }), []);
  client.setQueryData(salesKeys.cashiers({}), []);
  client.setQueryData(salesKeys.promotions({}), []);
  client.setQueryData(salesKeys.manualDiscounts({}), []);
  client.setQueryData(salesKeys.averageTicket({}), []);
  client.setQueryData(["stock"], []);

  await client.invalidateQueries({ queryKey: salesKey, refetchType: "none" });

  expect(client.getQueryState(salesKeys.report({}))?.isInvalidated).toBe(true);
  expect(
    client.getQueryState(salesKeys.productsAndCategories({ group: "category" }))?.isInvalidated,
  ).toBe(true);
  expect(client.getQueryState(salesKeys.cashiers({}))?.isInvalidated).toBe(true);
  expect(client.getQueryState(salesKeys.promotions({}))?.isInvalidated).toBe(true);
  expect(client.getQueryState(salesKeys.manualDiscounts({}))?.isInvalidated).toBe(true);
  expect(client.getQueryState(salesKeys.averageTicket({}))?.isInvalidated).toBe(true);
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

test("each range and register has its own sales by cashier key", () => {
  const keys = [
    salesKeys.cashiers({}),
    salesKeys.cashiers({ from: "2026-10-01", to: "2026-10-07" }),
    salesKeys.cashiers({ from: "2026-10-01", to: "2026-10-08" }),
    salesKeys.cashiers({ register_id: FRONT_REGISTER_ID }),
    salesKeys.report({ register_id: FRONT_REGISTER_ID }),
    salesKeys.productsAndCategories({ group: "category" }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});

test("each range and register has its own sales by promotion key", () => {
  const keys = [
    salesKeys.promotions({}),
    salesKeys.promotions({ from: "2026-10-01", to: "2026-10-07" }),
    salesKeys.promotions({ from: "2026-10-01", to: "2026-10-08" }),
    salesKeys.promotions({ register_id: FRONT_REGISTER_ID }),
    salesKeys.cashiers({ register_id: FRONT_REGISTER_ID }),
    salesKeys.report({ register_id: FRONT_REGISTER_ID }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});

test("each range, register and authorizer has its own manual discounts key", () => {
  const keys = [
    salesKeys.manualDiscounts({}),
    salesKeys.manualDiscounts({ from: "2026-10-01", to: "2026-10-07" }),
    salesKeys.manualDiscounts({ from: "2026-10-01", to: "2026-10-08" }),
    salesKeys.manualDiscounts({ register_id: FRONT_REGISTER_ID }),
    salesKeys.manualDiscounts({ authorized_by: ANA_USER_ID }),
    salesKeys.promotions({ register_id: FRONT_REGISTER_ID }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});

test("each range and register has its own average ticket key", () => {
  const keys = [
    salesKeys.averageTicket({}),
    salesKeys.averageTicket({ from: "2026-10-01", to: "2026-10-07" }),
    salesKeys.averageTicket({ from: "2026-10-01", to: "2026-10-08" }),
    salesKeys.averageTicket({ register_id: FRONT_REGISTER_ID }),
    salesKeys.cashiers({ register_id: FRONT_REGISTER_ID }),
    salesKeys.report({ register_id: FRONT_REGISTER_ID }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});
