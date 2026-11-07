import { expect, test } from "vitest";
import { registersSearch, snapshotBackupsFilters } from "./routes";

test("opens the backups on the first register", () => {
  expect(snapshotBackupsFilters.parse({})).toEqual({ register: "" });
});

test("keeps the register a URL names", () => {
  expect(snapshotBackupsFilters.parse({ register: "register-2" })).toEqual({
    register: "register-2",
  });
});

test("falls back to the first register for a value that is not text", () => {
  expect(snapshotBackupsFilters.parse({ register: 7 })).toEqual({ register: "" });
});

test("names no register and no panel tab by default", () => {
  expect(registersSearch.parse({})).toEqual({});
});

test("keeps the register and the panel tab a URL names", () => {
  expect(registersSearch.parse({ register: "register-2", tab: "backups" })).toEqual({
    register: "register-2",
    tab: "backups",
  });
});

test("drops a register that is not text and a panel tab the panel does not have", () => {
  expect(registersSearch.parse({ register: 7, tab: "unknown" })).toEqual({});
});
