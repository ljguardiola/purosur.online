import { describe, expect, it } from "vitest";
import { formatCents } from "./money";

describe("formatCents", () => {
  it.each([
    [0, "$ 0,00"],
    [5, "$ 0,05"],
    [500_000, "$ 5.000,00"],
    [2_000_050, "$ 20.000,50"],
  ])("writes %i cents as %s", (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });
});
