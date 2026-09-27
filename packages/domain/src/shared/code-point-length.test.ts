import { describe, expect, it } from "vitest";
import { codePointLength } from "./code-point-length.js";

describe("codePointLength", () => {
  it("counts an emoji outside the Basic Multilingual Plane once", () => {
    expect(codePointLength("a😀")).toBe(2);
  });

  it("counts each regional indicator of a flag as its own code point", () => {
    expect(codePointLength("🇦🇷")).toBe(2);
  });
});
