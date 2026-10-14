import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { averageTicketFilters } from "./average-ticket-filters";

test("opens on no range, every register and the newest week first", () => {
  expect(averageTicketFilters.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    sortBy: "week",
    sort: "descending",
  });
});

test("keeps the range, the register and the order a URL names", () => {
  const filters = {
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    sortBy: "averageTicket",
    sort: "ascending",
  };

  expect(averageTicketFilters.parse(filters)).toEqual(filters);
});

test.each(["week", "sales", "amount", "averageTicket"])("offers to order by %s", (sortBy) => {
  expect(averageTicketFilters.parse({ sortBy })).toMatchObject({ sortBy });
});

test("falls back to no range for one the cloud would refuse, keeping the rest", () => {
  const parsed = averageTicketFilters.parse({
    from: "2026-10-08",
    to: "2026-10-07",
    sortBy: "amount",
  });

  expect(parsed).toMatchObject({ from: "", to: "", sortBy: "amount" });
});

test.each([
  ["a column that does not exist", { sortBy: "name" }],
  ["a direction that does not exist", { sort: "up" }],
  ["values that are not text", { sortBy: 3, sort: false }],
])("falls back to the newest week first for %s", (_name, search) => {
  expect(averageTicketFilters.parse(search)).toMatchObject({
    sortBy: "week",
    sort: "descending",
  });
});
