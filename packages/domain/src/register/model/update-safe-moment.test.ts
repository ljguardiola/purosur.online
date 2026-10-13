import { describe, expect, it } from "vitest";
import { isSafeMomentToUpdate, REGISTER_UPDATE_HOLD_LIMIT_MS } from "./update-safe-moment.js";

describe("isSafeMomentToUpdate", () => {
  it("is safe when no sale is open", () => {
    expect(isSafeMomentToUpdate({ hasOpenSale: false })).toBe(true);
  });

  it("is not safe while a sale is open", () => {
    expect(isSafeMomentToUpdate({ hasOpenSale: true })).toBe(false);
  });
});

describe("REGISTER_UPDATE_HOLD_LIMIT_MS", () => {
  it("is thirty seconds", () => {
    expect(REGISTER_UPDATE_HOLD_LIMIT_MS).toBe(30_000);
  });
});
