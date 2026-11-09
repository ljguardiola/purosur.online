import { expect, test } from "vitest";
import { registersSearch } from "./registers-list-route";

test("names no register, no panel tab and no sessions' period by default", () => {
  expect(registersSearch.parse({})).toEqual({ from: "", to: "" });
});

test("keeps the register, the panel tab and the sessions' period a URL names", () => {
  expect(
    registersSearch.parse({
      register: "register-2",
      tab: "sessions",
      from: "2026-10-01",
      to: "2026-10-07",
    }),
  ).toEqual({ register: "register-2", tab: "sessions", from: "2026-10-01", to: "2026-10-07" });
});

test("drops a register that is not text and a panel tab the panel does not have", () => {
  expect(registersSearch.parse({ register: 7, tab: "unknown" })).toEqual({ from: "", to: "" });
});

test("drops a sessions' period the cloud would refuse", () => {
  expect(registersSearch.parse({ from: "2026-10-07", to: "2026-10-01" })).toEqual({
    from: "",
    to: "",
  });
});
