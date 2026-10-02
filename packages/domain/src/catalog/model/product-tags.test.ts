import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { repeatsATag } from "./product-tags.js";

describe("repeatsATag", () => {
  it("accepts a product with no tags", () => {
    expect(repeatsATag([])).toBe(false);
  });

  it("accepts tags that are all different", () => {
    expect(repeatsATag(["tag-a", "tag-b", "tag-c"])).toBe(false);
  });

  it("finds a tag given twice, wherever it appears", () => {
    expect(repeatsATag(["tag-a", "tag-a"])).toBe(true);
    expect(repeatsATag(["tag-a", "tag-b", "tag-c", "tag-b"])).toBe(true);
  });

  it("answers whether some tag is given more than once, for any list of tags", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("tag-a", "tag-b", "tag-c", "tag-d")), (tagIds) => {
        const repeated = tagIds.some((tagId, index) => tagIds.indexOf(tagId) !== index);
        expect(repeatsATag(tagIds)).toBe(repeated);
      }),
    );
  });
});
