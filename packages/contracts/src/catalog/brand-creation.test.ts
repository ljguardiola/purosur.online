import { BRAND_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { brandCreationBodySchema } from "./brand-creation.js";

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = brandCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("brandCreationBodySchema", () => {
  it("accepts a name and trims it", () => {
    expect(brandCreationBodySchema.safeParse({ name: "  Granix  " }).data).toEqual({
      name: "Granix",
    });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j as empty", (name) => {
    expect(firstFailure({ name })).toEqual({ field: "name", message: "name must not be empty" });
  });

  it("accepts a name of exactly the domain's maximum length and rejects a longer one", () => {
    expect(
      brandCreationBodySchema.safeParse({ name: "a".repeat(BRAND_NAME_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(firstFailure({ name: "a".repeat(BRAND_NAME_MAX_LENGTH + 1) })).toEqual({
      field: "name",
      message: `name must be at most ${BRAND_NAME_MAX_LENGTH} characters`,
    });
  });

  it("strips keys it does not know", () => {
    expect(brandCreationBodySchema.safeParse({ name: "A", active: false }).data).toEqual({
      name: "A",
    });
  });

  it.each([null, undefined, "Granix", 1, []])("rejects the body %j as not an object", (body) => {
    expect(brandCreationBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("brandCreationBodySchema, declared limits", () => {
  it("declares the name's maximum length", () => {
    expect(brandCreationBodySchema.shape.name.meta()).toEqual({ maxLength: BRAND_NAME_MAX_LENGTH });
  });
});
