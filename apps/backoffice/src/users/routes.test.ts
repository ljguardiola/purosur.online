import { expect, test } from "vitest";
import { usersListFilters } from "./routes";

test("opens the users list on users in every state", () => {
  expect(usersListFilters.parse({})).toEqual({ state: "all" });
});

test("keeps the users list state a URL names, falling back for one it does not offer", () => {
  expect(usersListFilters.parse({ state: "inactive" })).toEqual({ state: "inactive" });
  expect(usersListFilters.parse({ state: "deleted" })).toEqual({ state: "all" });
});
