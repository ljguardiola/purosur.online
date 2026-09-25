import {
  CATEGORY_NAME_MAX_LENGTH as SHARED_CATEGORY_NAME_MAX_LENGTH,
  categoryNameLength as sharedCategoryNameLength,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_NAME_MAX_LENGTH,
  categoryNameLength,
  categoryNameValidationFailure,
  readCategoryName,
  readParentId,
} from "./category-validation.js";

describe("readCategoryName", () => {
  it("reads a trimmed name from the request body", () => {
    expect(readCategoryName({ name: "  Semillas  " })).toBe("Semillas");
  });

  it("reads undefined when the name is missing, not a string, or blank after trimming", () => {
    expect(readCategoryName({})).toBeUndefined();
    expect(readCategoryName({ name: 42 })).toBeUndefined();
    expect(readCategoryName({ name: "   " })).toBeUndefined();
  });
});

describe("readParentId", () => {
  it("reads null for an absent or explicitly null parentId, meaning top level", () => {
    expect(readParentId({})).toBeNull();
    expect(readParentId({ parentId: null })).toBeNull();
  });

  it("reads the id string for a non-empty string parentId", () => {
    expect(readParentId({ parentId: "11111111-1111-1111-1111-111111111111" })).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("reads undefined for a malformed parentId (not a string, or an empty string)", () => {
    expect(readParentId({ parentId: 42 })).toBeUndefined();
    expect(readParentId({ parentId: "" })).toBeUndefined();
  });
});

describe("categoryNameValidationFailure", () => {
  it("rejects an empty or missing name", () => {
    expect(categoryNameValidationFailure(undefined)).toMatchObject({ field: "name" });
  });

  it("accepts a non-empty name", () => {
    expect(categoryNameValidationFailure("Semillas")).toBeUndefined();
  });

  it("accepts a name of exactly 100 characters", () => {
    expect(categoryNameValidationFailure("a".repeat(100))).toBeUndefined();
  });

  it("rejects a name longer than 100 characters", () => {
    expect(categoryNameValidationFailure("a".repeat(101))).toMatchObject({ field: "name" });
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(categoryNameValidationFailure("🌱".repeat(100))).toBeUndefined();
    expect(categoryNameValidationFailure("🌱".repeat(101))).toMatchObject({ field: "name" });
  });
});

describe("the cloud's local category name limit", () => {
  it("matches the shared limit", () => {
    expect(CATEGORY_NAME_MAX_LENGTH).toBe(SHARED_CATEGORY_NAME_MAX_LENGTH);
  });

  it("counts a name's length the same way the shared contract does", () => {
    for (const name of ["Semillas", "🌱".repeat(3), "Café 🌱 orgánico"]) {
      expect(categoryNameLength(name)).toBe(sharedCategoryNameLength(name));
    }
  });
});
