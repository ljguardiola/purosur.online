import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { salesByPromotionFilters } from "./sales-by-promotion-filters";

test("opens on no range, every register and the promotion that discounted most first", () => {
  expect(salesByPromotionFilters.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    sortBy: "discounted",
    sort: "descending",
  });
});

test("keeps the range, the register and the order a URL names", () => {
  const filters = {
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    sortBy: "lines",
    sort: "ascending",
  };

  expect(salesByPromotionFilters.parse(filters)).toEqual(filters);
});

test.each(["name", "lines", "units", "discounted"])("offers to order by %s", (sortBy) => {
  expect(salesByPromotionFilters.parse({ sortBy })).toMatchObject({ sortBy });
});

test("falls back to no range for one the cloud would refuse, keeping the rest", () => {
  const parsed = salesByPromotionFilters.parse({
    from: "2026-10-08",
    to: "2026-10-07",
    sortBy: "name",
  });

  expect(parsed).toMatchObject({ from: "", to: "", sortBy: "name" });
});

test.each([
  ["a column that does not exist", { sortBy: "sessions" }],
  ["a direction that does not exist", { sort: "up" }],
  ["values that are not text", { sortBy: 3, sort: false }],
])("falls back to the largest discount first for %s", (_name, search) => {
  expect(salesByPromotionFilters.parse(search)).toMatchObject({
    sortBy: "discounted",
    sort: "descending",
  });
});
