import { describe, expect, it } from "vitest";
import { CATEGORY_NAME_MAX_LENGTH, categoryNameLength } from "./category-name.js";

describe("CATEGORY_NAME_MAX_LENGTH", () => {
  it("allows category names of up to 100 characters", () => {
    expect(CATEGORY_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("categoryNameLength", () => {
  it("counts each letter as one character", () => {
    expect(categoryNameLength("Semillas")).toBe(8);
  });

  it("counts each emoji as one character", () => {
    expect(categoryNameLength("🌱".repeat(3))).toBe(3);
    expect(categoryNameLength("Café 🌱")).toBe(6);
  });
});
