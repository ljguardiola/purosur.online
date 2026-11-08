import { expect, test } from "vitest";
import {
  assemblyBatchesFilters,
  expiringLotsFilters,
  initialInventoryFilters,
  recipesListFilters,
  stockBalancesFilters,
  stockCountsFilters,
  stockMovementsFilters,
  stockMovementsSearch,
} from "./routes";

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

test("opens the movements of every kind the person may see", () => {
  expect(stockMovementsSearch.parse({})).toEqual({
    search: "",
    reason: "ALL",
    period: "30",
    type: [],
    view: "list",
    from: "",
    to: "",
  });
});

test("keeps the view and the range of the losses by reason a URL names", () => {
  expect(
    stockMovementsSearch.parse({ view: "reason", from: "2026-12-01", to: "2026-12-31" }),
  ).toMatchObject({ view: "reason", from: "2026-12-01", to: "2026-12-31" });
});

test("falls back to the list for a view it does not offer", () => {
  expect(stockMovementsSearch.parse({ view: "category" }).view).toBe("list");
});

test("drops a range the report refuses", () => {
  expect(stockMovementsSearch.parse({ from: "2026-12-31", to: "2026-12-01" })).toMatchObject({
    from: "",
    to: "",
  });
});

test("keeps the kinds of movement a URL names, as a list or as the text the address writes", () => {
  expect(stockMovementsSearch.parse({ type: ["adjustment", "loss"] }).type).toEqual([
    "adjustment",
    "loss",
  ]);
  expect(stockMovementsSearch.parse({ type: "adjustment,loss" }).type).toEqual([
    "adjustment",
    "loss",
  ]);
  expect(stockMovementsSearch.parse({ type: "count" }).type).toEqual(["count"]);
});

test("falls back to every kind for a kind of movement it does not offer", () => {
  expect(stockMovementsSearch.parse({ type: "count,theft" }).type).toEqual([]);
  expect(stockMovementsSearch.parse({ type: 3 }).type).toEqual([]);
  expect(stockMovementsSearch.parse({ type: "" }).type).toEqual([]);
});

test("opens the initial inventory on every lot, whatever its cost", () => {
  expect(initialInventoryFilters.parse({})).toEqual({ search: "", cost: "all" });
});

test("keeps the initial inventory filters a URL names, falling back for a value it does not offer", () => {
  expect(initialInventoryFilters.parse({ search: "miel", cost: "incomplete" })).toEqual({
    search: "miel",
    cost: "incomplete",
  });
  expect(initialInventoryFilters.parse({ cost: "known" }).cost).toBe("known");
  expect(initialInventoryFilters.parse({ search: 1, cost: "free" })).toEqual(
    initialInventoryFilters.parse({}),
  );
});

test("opens the expiring lots on every lot, whatever its category, expiry or period", () => {
  expect(expiringLotsFilters.parse({})).toEqual({
    search: "",
    category: "ALL",
    expiry: "all",
    from: "",
    to: "",
  });
});

test("keeps the period an expiring lots URL names and drops one the cloud would refuse", () => {
  expect(expiringLotsFilters.parse({ from: "2026-12-01", to: "2026-12-31" })).toMatchObject({
    from: "2026-12-01",
    to: "2026-12-31",
  });
  expect(expiringLotsFilters.parse({ from: "2026-12-31", to: "2026-12-01" })).toMatchObject({
    from: "",
    to: "",
  });
});

test("keeps the expiring lots filters a URL names, falling back for a value it does not offer", () => {
  const filters = { search: "chía", category: "category-2", expiry: "expired", from: "", to: "" };
  expect(expiringLotsFilters.parse(filters)).toEqual(filters);
  expect(expiringLotsFilters.parse({ expiry: "upcoming" }).expiry).toBe("upcoming");
  expect(expiringLotsFilters.parse({ search: 1, category: false, expiry: "soon" })).toEqual(
    expiringLotsFilters.parse({}),
  );
});

test("opens the recipes without a search, by product in ascending order", () => {
  expect(recipesListFilters.parse({})).toEqual({ search: "", sort: "ascending" });
});

test("keeps the recipes filters a URL names, falling back for a value it does not offer", () => {
  const filters = { search: "mix", sort: "descending" };
  expect(recipesListFilters.parse(filters)).toEqual(filters);
  expect(recipesListFilters.parse({ search: 1, sort: "up" })).toEqual(recipesListFilters.parse({}));
});

test("opens the batches of the last 30 days without a search", () => {
  expect(assemblyBatchesFilters.parse({})).toEqual({ search: "", period: "30" });
});

test("keeps the batches filters a URL names, falling back for a value it does not offer", () => {
  expect(assemblyBatchesFilters.parse({ search: "mix", period: "90" })).toEqual({
    search: "mix",
    period: "90",
  });
  expect(assemblyBatchesFilters.parse({ search: 1, period: "12" })).toEqual(
    assemblyBatchesFilters.parse({}),
  );
});
