import { expect, test } from "vitest";
import { stockBalancesFilters, stockCountsFilters, stockMovementsFilters } from "./routes";

test("opens the balances on every product of every category", () => {
  expect(stockBalancesFilters.parse({})).toEqual({
    search: "",
    category: "ALL",
    balance: "all",
    sortBy: "product",
    sort: "ascending",
  });
});

test("keeps the balances filters a URL names, falling back for a value it does not offer", () => {
  const filters = {
    search: "miel",
    category: "category-2",
    balance: "negative",
    sortBy: "value",
    sort: "descending",
  };
  expect(stockBalancesFilters.parse(filters)).toEqual(filters);
  expect(
    stockBalancesFilters.parse({
      search: 1,
      category: false,
      balance: "some",
      sortBy: "price",
      sort: "up",
    }),
  ).toEqual(stockBalancesFilters.parse({}));
});

test("opens the counts of the last 30 days in every category", () => {
  expect(stockCountsFilters.parse({})).toEqual({
    search: "",
    category: "ALL",
    period: "30",
    sortBy: "date",
    sort: "descending",
  });
});

test("keeps the counts filters a URL names, falling back for a period it does not offer", () => {
  expect(stockCountsFilters.parse({ period: "7" }).period).toBe("7");
  expect(stockCountsFilters.parse({ period: "90" }).period).toBe("90");
  expect(stockCountsFilters.parse({ period: "12" }).period).toBe("30");
});

test("keeps the counts order a URL names, falling back for one it does not offer", () => {
  const order = { sortBy: "difference", sort: "ascending" };
  expect(stockCountsFilters.parse(order)).toMatchObject(order);
  expect(stockCountsFilters.parse({ sortBy: "price", sort: "up" })).toMatchObject({
    sortBy: "date",
    sort: "descending",
  });
});

test("opens the losses and adjustments of the last 30 days, for every reason", () => {
  expect(stockMovementsFilters.parse({})).toEqual({ search: "", reason: "ALL", period: "30" });
});

test("keeps the reason a URL names, falling back for one that is not text", () => {
  expect(stockMovementsFilters.parse({ reason: "theft" }).reason).toBe("theft");
  expect(stockMovementsFilters.parse({ reason: 3 }).reason).toBe("ALL");
});
