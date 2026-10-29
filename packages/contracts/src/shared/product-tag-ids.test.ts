import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { optionalTagIdsSchema, requiredTagIdsSchema } from "./product-tag-ids.js";

const INVALID = "tagIds must be a list of existing tags' ids, [] for none";
const MISSING = "tagIds must be sent, [] for none";
const REPEATED = "tagIds must not repeat a tag";
const SECOND_TAG = "22222222-2222-2222-2222-222222222222";

function messagesOf(schema: z.ZodType, tagIds: unknown): string[] {
  return schema.safeParse(tagIds).error?.issues.map((issue) => issue.message) ?? [];
}

describe.each([
  ["optionalTagIdsSchema", optionalTagIdsSchema],
  ["requiredTagIdsSchema", requiredTagIdsSchema],
] as const)("%s", (_, schema) => {
  it("keeps several tag ids in the order sent, in their canonical lowercase form", () => {
    expect(schema.safeParse(["D131EC62-1111-4AAA-8BBB-ABCDEF012345", SECOND_TAG]).data).toEqual([
      "d131ec62-1111-4aaa-8bbb-abcdef012345",
      SECOND_TAG,
    ]);
  });

  it("reads [] as no tags", () => {
    expect(schema.safeParse([]).data).toEqual([]);
  });

  it.each([null, "tag-1", 42, {}, [42], [""], [null], ["tag-1", ""], ["not-an-id"]])(
    "rejects the tagIds %j as malformed",
    (tagIds) => {
      expect(new Set(messagesOf(schema, tagIds))).toEqual(new Set([INVALID]));
    },
  );

  it("rejects a list holding a malformed id after a valid one", () => {
    expect(messagesOf(schema, [SECOND_TAG, "not-an-id"])).toEqual([INVALID]);
  });

  it.each([
    ["33333333-3333-3333-3333-333333333333", "33333333-3333-3333-3333-333333333333"],
    ["aaaaaaaa-3333-3333-3333-333333333333", "AAAAAAAA-3333-3333-3333-333333333333"],
  ])("rejects a tag sent more than once as %j and %j", (first, second) => {
    expect(messagesOf(schema, [first, SECOND_TAG, second])).toEqual([REPEATED]);
  });
});

describe("optionalTagIdsSchema", () => {
  it("reads missing tagIds as no tags", () => {
    expect(optionalTagIdsSchema.safeParse(undefined)).toEqual({ success: true, data: [] });
  });
});

describe("requiredTagIdsSchema", () => {
  it("rejects missing tagIds as missing, so a client that omits them cannot remove a product's tags", () => {
    expect(messagesOf(requiredTagIdsSchema, undefined)).toEqual([MISSING]);
  });
});
