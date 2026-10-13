import { MAX_STOCK_QUANTITY } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { assemblyBatchBodySchema, assemblyBatchPreviewBodySchema } from "./assembly-batch-body.js";

const MIX = "11111111-1111-1111-1111-111111111111";
const NUTS = "22222222-2222-2222-2222-222222222222";
const BAG = "33333333-3333-3333-3333-333333333333";

const body = {
  productId: MIX,
  recipeVersion: 2,
  used: [
    { componentProductId: NUTS, quantity: 12_000 },
    { componentProductId: BAG, quantity: 0 },
  ],
  output: 14_000,
};

function firstFailure(
  schema: typeof assemblyBatchBodySchema | typeof assemblyBatchPreviewBodySchema,
  value: unknown,
): { path: unknown[]; message: unknown } | undefined {
  const result = schema.safeParse(value);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("assemblyBatchBodySchema", () => {
  it("reads what was used of each component, zero included, and the output obtained", () => {
    expect(assemblyBatchBodySchema.safeParse(body).data).toEqual(body);
  });

  it("reads ids in upper case in lower case", () => {
    const parsed = assemblyBatchBodySchema.parse({ ...body, productId: MIX.toUpperCase() });

    expect(parsed.productId).toBe(MIX);
  });

  it.each([undefined, "", "not-a-uuid", 7])("rejects the product id %j", (productId) => {
    expect(firstFailure(assemblyBatchBodySchema, { ...body, productId })).toEqual({
      path: ["productId"],
      message: "productId must be a product's id",
    });
  });

  it.each([undefined, 0, -1, 1.5, "2"])("rejects the recipe version %j", (recipeVersion) => {
    expect(firstFailure(assemblyBatchBodySchema, { ...body, recipeVersion })?.path).toEqual([
      "recipeVersion",
    ]);
  });

  it("leaves it to the domain to refuse a batch without components", () => {
    expect(assemblyBatchBodySchema.safeParse({ ...body, used: [] }).success).toBe(true);
  });

  it.each([undefined, "", "not-a-uuid"])("rejects the component id %j", (componentProductId) => {
    expect(
      firstFailure(assemblyBatchBodySchema, {
        ...body,
        used: [{ componentProductId, quantity: 1_000 }],
      }),
    ).toEqual({
      path: ["used", 0, "componentProductId"],
      message: "componentProductId must be a product's id",
    });
  });

  it.each([undefined, -1, 1.5, "1000", MAX_STOCK_QUANTITY + 1])(
    "rejects the used quantity %j",
    (quantity) => {
      expect(
        firstFailure(assemblyBatchBodySchema, {
          ...body,
          used: [{ componentProductId: NUTS, quantity }],
        }),
      ).toEqual({
        path: ["used", 0, "quantity"],
        message: "quantity must be a non-negative integer number of thousandths",
      });
    },
  );

  it("accepts the largest used quantity a stock movement may carry", () => {
    expect(
      assemblyBatchBodySchema.safeParse({
        ...body,
        used: [{ componentProductId: NUTS, quantity: MAX_STOCK_QUANTITY }],
      }).success,
    ).toBe(true);
  });

  it.each([undefined, 0, -1, 1.5, "1000", MAX_STOCK_QUANTITY + 1])(
    "rejects the output %j",
    (output) => {
      expect(firstFailure(assemblyBatchBodySchema, { ...body, output })).toEqual({
        path: ["output"],
        message: "output must be a positive integer number of thousandths",
      });
    },
  );

  it("accepts the smallest and the largest output", () => {
    for (const output of [1, MAX_STOCK_QUANTITY]) {
      expect(assemblyBatchBodySchema.safeParse({ ...body, output }).success).toBe(true);
    }
  });

  it("strips keys it does not define", () => {
    expect(assemblyBatchBodySchema.safeParse({ ...body, locationId: "x" }).data).toEqual(body);
  });
});

describe("assemblyBatchPreviewBodySchema", () => {
  const preview = { productId: MIX, size: 10_000 };

  it("reads the product and the size of the batch alone", () => {
    expect(assemblyBatchPreviewBodySchema.safeParse(preview).data).toEqual(preview);
  });

  it("reads the quantities used and the output when they are given", () => {
    const full = { ...preview, used: body.used, output: 14_000 };

    expect(assemblyBatchPreviewBodySchema.safeParse(full).data).toEqual(full);
  });

  it.each([undefined, 0, -1, 1.5, "1000", MAX_STOCK_QUANTITY + 1])(
    "rejects the size %j",
    (size) => {
      expect(firstFailure(assemblyBatchPreviewBodySchema, { ...preview, size })).toEqual({
        path: ["size"],
        message: "size must be a positive integer number of thousandths",
      });
    },
  );

  it.each([undefined, "", "not-a-uuid"])("rejects the product id %j", (productId) => {
    expect(firstFailure(assemblyBatchPreviewBodySchema, { ...preview, productId })?.path).toEqual([
      "productId",
    ]);
  });

  it("rejects an invalid output or used quantity like a batch does", () => {
    expect(firstFailure(assemblyBatchPreviewBodySchema, { ...preview, output: 0 })?.path).toEqual([
      "output",
    ]);
    expect(
      firstFailure(assemblyBatchPreviewBodySchema, {
        ...preview,
        used: [{ componentProductId: NUTS, quantity: -1 }],
      })?.path,
    ).toEqual(["used", 0, "quantity"]);
  });
});
