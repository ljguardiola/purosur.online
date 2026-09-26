import { describe, expect, it } from "vitest";
import {
  CATEGORY_NAME_MAX_LENGTH,
  categoryNameLength,
  isCategoryNameTooLong,
} from "./category-name.js";

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

describe("isCategoryNameTooLong", () => {
  it("accepts a name of exactly 100 characters", () => {
    expect(isCategoryNameTooLong("a".repeat(CATEGORY_NAME_MAX_LENGTH))).toBe(false);
  });

  it("rejects a name of 101 characters", () => {
    expect(isCategoryNameTooLong("a".repeat(CATEGORY_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(isCategoryNameTooLong("🌱".repeat(CATEGORY_NAME_MAX_LENGTH))).toBe(false);
    expect(isCategoryNameTooLong("🌱".repeat(CATEGORY_NAME_MAX_LENGTH + 1))).toBe(true);
  });
});
