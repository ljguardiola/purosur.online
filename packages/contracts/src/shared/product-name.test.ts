import { PRODUCT_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { productNameSchema } from "./product-name.js";

function messageOf(name: unknown): string | undefined {
  return productNameSchema.safeParse(name).error?.issues[0]?.message;
}

describe("productNameSchema", () => {
  it("accepts a name and trims it", () => {
    expect(productNameSchema.safeParse("  Maceta 20cm  ").data).toBe("Maceta 20cm");
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j as empty", (name) => {
    expect(messageOf(name)).toBe("name must not be empty");
  });

  it("accepts a name of exactly the domain's maximum length and rejects a longer one", () => {
    expect(productNameSchema.safeParse("a".repeat(PRODUCT_NAME_MAX_LENGTH)).success).toBe(true);
    expect(messageOf("a".repeat(PRODUCT_NAME_MAX_LENGTH + 1))).toBe(
      `name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
    );
  });

  it("measures the length after trimming", () => {
    expect(productNameSchema.safeParse(` ${"a".repeat(PRODUCT_NAME_MAX_LENGTH)} `).success).toBe(
      true,
    );
  });

  it("declares the name's maximum length", () => {
    expect(productNameSchema.meta()).toEqual({ maxLength: PRODUCT_NAME_MAX_LENGTH });
  });
});
