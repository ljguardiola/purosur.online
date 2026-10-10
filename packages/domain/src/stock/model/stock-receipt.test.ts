import { describe, expect, it } from "vitest";
import { movesBalance } from "./stock-receipt.js";

describe("movesBalance", () => {
  it("moves the balance of a movement no count supersedes", () => {
    expect(movesBalance({ supersededByCountId: null })).toBe(true);
  });

  it("leaves the balance alone for a movement a count supersedes", () => {
    expect(movesBalance({ supersededByCountId: "count-1" })).toBe(false);
  });
});
