import { describe, expect, it } from "vitest";
import { formatCents } from "./format-cents";

describe("formatCents", () => {
  it.each([
    [0, "$ 0,00"],
    [5, "$ 0,05"],
    [476_000, "$ 4.760,00"],
    [123_456_789, "$ 1.234.567,89"],
  ])("writes %i cents as pesos: %s", (cents, text) => {
    expect(formatCents(cents).replace(/ /g, " ")).toBe(text);
  });
});
