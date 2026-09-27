import { expect, test } from "vitest";
import { alertsListFilters } from "./routes";

test("opens the alerts list on the first page of open alerts of every level", () => {
  expect(alertsListFilters.parse({})).toEqual({
    level: "all",
    status: "open",
    search: "",
    page: 1,
  });
});

test("keeps the alerts list filters a URL names", () => {
  const filters = { level: "critical", status: "closed", search: "caja", page: 3 };
  expect(alertsListFilters.parse(filters)).toEqual(filters);
});

test("falls back to each alerts list default for a value the list does not offer", () => {
  for (const page of [0, -2, 1.5, "2"]) {
    expect(alertsListFilters.parse({ page }).page).toBe(1);
  }
  expect(alertsListFilters.parse({ level: "fatal", status: "snoozed", search: {} })).toEqual(
    alertsListFilters.parse({}),
  );
});
