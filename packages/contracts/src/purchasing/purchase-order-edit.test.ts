import { describe, expect, it } from "vitest";
import { purchaseOrderEditBodySchema } from "./purchase-order-edit.js";

const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

const line = { productId: PRODUCT_ID, packages: 3, quantityPerPackage: 12_000 };

function firstFailure(body: unknown): { path: unknown[]; message: string } | undefined {
  const result = purchaseOrderEditBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("purchaseOrderEditBodySchema", () => {
  it("accepts lines of a product, a number of packages and the quantity each holds", () => {
    expect(purchaseOrderEditBodySchema.safeParse({ lines: [line] }).data).toEqual({
      lines: [line],
    });
  });

  it("carries no price", () => {
    const parsed = purchaseOrderEditBodySchema.parse({
      lines: [{ ...line, expectedPackagePriceCents: 100 }],
    });
    expect(parsed.lines[0]).toEqual(line);
  });

  it.each([undefined, "", "nope", 7])("rejects the product id %j", (productId) => {
    expect(firstFailure({ lines: [{ ...line, productId }] })).toEqual({
      path: ["lines", 0, "productId"],
      message: "productId must be a product's id",
    });
  });

  it.each([undefined, 0, 1.5])("rejects %j as a number of packages", (packages) => {
    expect(firstFailure({ lines: [{ ...line, packages }] })?.path).toEqual([
      "lines",
      0,
      "packages",
    ]);
  });

  it.each([undefined, 0, 0.5])("rejects %j as the quantity each package holds", (quantity) => {
    expect(firstFailure({ lines: [{ ...line, quantityPerPackage: quantity }] })?.path).toEqual([
      "lines",
      0,
      "quantityPerPackage",
    ]);
  });

  it("rejects lines that are not a list", () => {
    expect(firstFailure({ lines: "nope" })?.path).toEqual(["lines"]);
  });
});
