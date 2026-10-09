import { describe, expect, it } from "vitest";
import { isPasskeyCloneSignal } from "./passkey-clone-signal.js";

describe("isPasskeyCloneSignal", () => {
  it("is not a clone signal while the counter has never left zero", () => {
    expect(isPasskeyCloneSignal(0, 0)).toBe(false);
  });

  it("is not a clone signal when the counter leaves zero", () => {
    expect(isPasskeyCloneSignal(0, 1)).toBe(false);
  });

  it("is not a clone signal when the counter increases", () => {
    expect(isPasskeyCloneSignal(4, 5)).toBe(false);
  });

  it("is a clone signal when the counter repeats after leaving zero", () => {
    expect(isPasskeyCloneSignal(4, 4)).toBe(true);
  });

  it("is a clone signal when the counter decreases after leaving zero", () => {
    expect(isPasskeyCloneSignal(4, 3)).toBe(true);
  });
});
