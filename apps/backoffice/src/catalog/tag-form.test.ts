import { describe, expect, it } from "vitest";
import { renameReachText, tagEditRequestFrom } from "./tag-form";

describe("renameReachText", () => {
  it("says nothing for a tag on no product", () => {
    expect(renameReachText(0)).toBeUndefined();
  });

  it("names the one product, or how many products, show the new name", () => {
    expect(renameReachText(1)).toBe("El nombre nuevo se ve en su producto.");
    expect(renameReachText(34)).toBe("El nombre nuevo se ve en sus 34 productos.");
    expect(renameReachText(1200)).toBe("El nombre nuevo se ve en sus 1.200 productos.");
  });
});

describe("tagEditRequestFrom", () => {
  it("sends the trimmed name with the version it was loaded at", () => {
    expect(tagEditRequestFrom({ name: "  Vegano ", version: 3 })).toEqual({
      name: "Vegano",
      version: 3,
    });
  });
});
