import { expect, test } from "vitest";
import { registersSearch } from "./routes";

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
