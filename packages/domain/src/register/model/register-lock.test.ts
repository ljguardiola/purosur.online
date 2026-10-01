import { describe, expect, it } from "vitest";
import { isLockedToAnother } from "./register-lock.js";

const SESSION = { openedBy: "ana" };

describe("isLockedToAnother", () => {
  it("leaves a register with no open cash session free for anyone", () => {
    expect(isLockedToAnother(undefined, "bruno")).toBe(false);
  });

  it("leaves the register open to the person who opened its cash session", () => {
    expect(isLockedToAnother(SESSION, "ana")).toBe(false);
  });

  it("locks the register to its opener for anyone else", () => {
    expect(isLockedToAnother(SESSION, "bruno")).toBe(true);
  });

  it("keeps the register locked while nobody is signed in", () => {
    expect(isLockedToAnother(SESSION, undefined)).toBe(true);
  });
});
