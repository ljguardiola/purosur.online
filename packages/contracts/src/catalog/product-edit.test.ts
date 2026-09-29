import { describe, expect, it } from "vitest";
import { productEditBodySchema } from "./product-edit.js";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Maceta",
    categoryId: "cat-1",
    saleUnit: "UNIT",
    barcodes: ["111"],
    version: 1,
    ...overrides,
  };
}

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = productEditBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("productEditBodySchema", () => {
  it("reads the creation fields together with the version loaded", () => {
    const result = productEditBodySchema.safeParse(
      validBody({ name: " Maceta ", netContent: { quantity: 2, unit: "L" }, version: 4 }),
    );

    expect(result.data).toEqual({
      name: "Maceta",
      categoryId: "cat-1",
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: { quantity: 2, unit: "L" },
      version: 4,
    });
  });

  it("reads absent net content as none", () => {
    expect(productEditBodySchema.safeParse(validBody()).data).toMatchObject({ netContent: null });
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure(validBody({ version }))).toEqual({
      field: "version",
      message: "version must be the positive integer it was loaded with",
    });
  });

  it("reports a creation field before the version", () => {
    expect(firstFailure(validBody({ name: "", version: 0 }))?.field).toBe("name");
  });

  it("reports the net content quantity before the version", () => {
    expect(
      firstFailure(validBody({ netContent: { quantity: 0, unit: "KG" }, version: 0 }))?.field,
    ).toBe("netContentQuantity");
  });

  it("reports a malformed net content before the version", () => {
    expect(firstFailure(validBody({ netContent: "x", version: 0 }))?.field).toBe("netContent");
  });

  it.each([null, undefined, "Maceta", 1, []])("rejects the body %j as not an object", (body) => {
    expect(productEditBodySchema.safeParse(body).success).toBe(false);
  });

  it("strips keys it does not know", () => {
    expect(productEditBodySchema.safeParse(validBody({ active: false })).data).not.toHaveProperty(
      "active",
    );
  });
});
