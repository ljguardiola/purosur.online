import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { optionalBrandIdSchema, requiredBrandIdSchema } from "./product-brand-id.js";

const INVALID = "brandId must be an existing brand's id, or null for none";
const MISSING = "brandId must be sent, null for none";

function messagesOf(schema: z.ZodType, brandId: unknown): string[] {
  return schema.safeParse(brandId).error?.issues.map((issue) => issue.message) ?? [];
}

describe("optionalBrandIdSchema", () => {
  it.each([undefined, null])("reads %j as no brand", (brandId) => {
    expect(optionalBrandIdSchema.safeParse(brandId)).toEqual({ success: true, data: null });
  });

  it("keeps a brand id, in its canonical lowercase form", () => {
    expect(optionalBrandIdSchema.safeParse("D131EC62-1111-4AAA-8BBB-ABCDEF012345").data).toBe(
      "d131ec62-1111-4aaa-8bbb-abcdef012345",
    );
  });

  it.each([42, "", "not-an-id", true, {}])("rejects the brandId %j as malformed", (brandId) => {
    expect(
      optionalBrandIdSchema.safeParse(brandId).error?.issues.map((issue) => issue.message),
    ).toEqual([INVALID]);
  });
});

describe("requiredBrandIdSchema", () => {
  it("reads null as no brand", () => {
    expect(requiredBrandIdSchema.safeParse(null)).toEqual({ success: true, data: null });
  });

  it("keeps a brand id, in its canonical lowercase form", () => {
    expect(requiredBrandIdSchema.safeParse("D131EC62-1111-4AAA-8BBB-ABCDEF012345").data).toBe(
      "d131ec62-1111-4aaa-8bbb-abcdef012345",
    );
  });

  it("rejects a missing brandId as missing, so a client that omits it cannot remove a product's brand", () => {
    expect(messagesOf(requiredBrandIdSchema, undefined)).toEqual([MISSING]);
  });

  it.each([42, "", "not-an-id", true, {}])(
    "rejects the brandId %j only as malformed, never as missing",
    (brandId) => {
      expect(messagesOf(requiredBrandIdSchema, brandId)).toEqual([INVALID]);
    },
  );
});
