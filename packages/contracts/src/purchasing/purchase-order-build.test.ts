import { describe, expect, it } from "vitest";
import {
  purchaseOrderBuildBodySchema,
  purchaseOrderBuildResponseSchema,
} from "./purchase-order-build.js";

const SUPPLIER_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

const choice = { productId: PRODUCT_ID, supplierId: SUPPLIER_ID, packages: 3 };

function firstFailure(body: unknown): { path: unknown[]; message: string } | undefined {
  const result = purchaseOrderBuildBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("purchaseOrderBuildBodySchema", () => {
  it("accepts choices of a product, a supplier and a number of packages", () => {
    expect(purchaseOrderBuildBodySchema.safeParse({ choices: [choice] }).data).toEqual({
      choices: [choice],
    });
  });

  it("reads the ids in lower case", () => {
    const parsed = purchaseOrderBuildBodySchema.parse({
      choices: [{ ...choice, productId: PRODUCT_ID.replace(/2/g, "A") }],
    });
    expect(parsed.choices[0]?.productId).toBe(PRODUCT_ID.replace(/2/g, "a"));
  });

  it.each([undefined, "", "nope", 7])("rejects the product id %j", (productId) => {
    expect(firstFailure({ choices: [{ ...choice, productId }] })).toEqual({
      path: ["choices", 0, "productId"],
      message: "productId must be a product's id",
    });
  });

  it.each([undefined, "", "nope", 7])("rejects the supplier id %j", (supplierId) => {
    expect(firstFailure({ choices: [{ ...choice, supplierId }] })).toEqual({
      path: ["choices", 0, "supplierId"],
      message: "supplierId must be a supplier's id",
    });
  });

  it.each([undefined, 0, 1.5])("rejects %j as a number of packages", (packages) => {
    expect(firstFailure({ choices: [{ ...choice, packages }] })).toEqual({
      path: ["choices", 0, "packages"],
      message: "packages must be a positive whole number",
    });
  });

  it("rejects choices that are not a list", () => {
    expect(firstFailure({ choices: "nope" })?.path).toEqual(["choices"]);
    expect(firstFailure({})?.path).toEqual(["choices"]);
  });
});

describe("purchaseOrderBuildResponseSchema", () => {
  it("accepts the ids of the orders built", () => {
    expect(purchaseOrderBuildResponseSchema.safeParse({ orderIds: ["a", "b"] }).data).toEqual({
      orderIds: ["a", "b"],
    });
  });

  it.each([{}, { orderIds: "a" }, { orderIds: [1] }])("rejects %j", (body) => {
    expect(purchaseOrderBuildResponseSchema.safeParse(body).success).toBe(false);
  });
});
