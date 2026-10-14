import {
  MAX_STOCK_QUANTITY,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { assemblyBatchBodySchema, assemblyBatchPreviewQuerySchema } from "./assembly-batch-body.js";

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
  schema: typeof assemblyBatchBodySchema | typeof assemblyBatchPreviewQuerySchema,
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

  it("declares the units and the largest value of the used quantity and of the output", () => {
    const units = {
      decimals: STOCK_QUANTITY_DECIMALS,
      perUnit: STOCK_QUANTITY_PER_UNIT,
      maxValue: MAX_STOCK_QUANTITY,
    };

    expect(assemblyBatchBodySchema.shape.used.element.shape.quantity.meta()).toEqual(units);
    expect(assemblyBatchBodySchema.shape.output.meta()).toEqual(units);
    expect(assemblyBatchPreviewQuerySchema.shape.size.meta()).toEqual(units);
  });
});

describe("assemblyBatchPreviewQuerySchema", () => {
  const preview = { productId: MIX, size: "10000" };
  const parsed = { productId: MIX, size: 10_000 };

  it("reads the product and the size of the batch alone", () => {
    expect(assemblyBatchPreviewQuerySchema.safeParse(preview).data).toEqual(parsed);
  });

  it("reads the quantities used, one per component, and the output when they are given", () => {
    const query = {
      ...preview,
      used: [`${NUTS}:12000`, `${BAG}:0`],
      output: "14000",
    };

    expect(assemblyBatchPreviewQuerySchema.safeParse(query).data).toEqual({
      ...parsed,
      used: body.used,
      output: 14_000,
    });
  });

  it("reads a single quantity used as a list of one", () => {
    expect(
      assemblyBatchPreviewQuerySchema.safeParse({ ...preview, used: `${NUTS}:500` }).data,
    ).toEqual({ ...parsed, used: [{ componentProductId: NUTS, quantity: 500 }] });
  });

  it.each([undefined, "", "abc", "0", "-1", "1.5", "1e3", String(MAX_STOCK_QUANTITY + 1)])(
    "rejects the size %j",
    (size) => {
      expect(firstFailure(assemblyBatchPreviewQuerySchema, { ...preview, size })).toEqual({
        path: ["size"],
        message: "size must be a positive integer number of thousandths",
      });
    },
  );

  it("accepts the largest size", () => {
    expect(
      assemblyBatchPreviewQuerySchema.safeParse({ ...preview, size: String(MAX_STOCK_QUANTITY) })
        .success,
    ).toBe(true);
  });

  it.each([undefined, "", "not-a-uuid"])("rejects the product id %j", (productId) => {
    expect(firstFailure(assemblyBatchPreviewQuerySchema, { ...preview, productId })?.path).toEqual([
      "productId",
    ]);
  });

  it.each(["0", "-1", "1.5", "abc", ""])("rejects the output %j", (output) => {
    expect(firstFailure(assemblyBatchPreviewQuerySchema, { ...preview, output })).toEqual({
      path: ["output"],
      message: "output must be a positive integer number of thousandths",
    });
  });

  it.each([`${NUTS}`, `${NUTS}:`, `${NUTS}:x`, `${NUTS}:-1`, `${NUTS}:1.5`, `${NUTS}:1:2`, ":5"])(
    "rejects the used entry %j",
    (entry) => {
      expect(
        firstFailure(assemblyBatchPreviewQuerySchema, { ...preview, used: [entry] })?.path[0],
      ).toBe("used");
    },
  );

  it.each([`${NUTS}:5x`, `${NUTS}:x5`, `x:${NUTS}:5`, `${NUTS}:5:`])(
    "rejects the used entry %j that only contains a quantity",
    (entry) => {
      expect(assemblyBatchPreviewQuerySchema.safeParse({ ...preview, used: [entry] }).success).toBe(
        false,
      );
    },
  );

  it("rejects a used entry that is not text", () => {
    expect(firstFailure(assemblyBatchPreviewQuerySchema, { ...preview, used: [5] })).toEqual({
      path: ["used", 0],
      message: "quantity must be a non-negative integer number of thousandths",
    });
  });

  it("rejects a used entry for something that is not a product's id", () => {
    expect(
      firstFailure(assemblyBatchPreviewQuerySchema, { ...preview, used: ["not-a-uuid:5"] }),
    ).toEqual({
      path: ["used", 0, "componentProductId"],
      message: "componentProductId must be a product's id",
    });
  });
});
