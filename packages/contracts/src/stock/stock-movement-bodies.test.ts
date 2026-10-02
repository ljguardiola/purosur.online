import { MAX_STOCK_QUANTITY } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  stockAdjustmentBodySchema,
  stockAdjustmentDirectionsSchema,
  stockCountBodySchema,
  stockLossBodySchema,
  stockMovementChangeSchema,
} from "./stock-movement-bodies.js";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

function firstIssue(
  schema:
    | typeof stockLossBodySchema
    | typeof stockAdjustmentBodySchema
    | typeof stockCountBodySchema,
  body: unknown,
): { field: unknown; message: string } | undefined {
  const result = schema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("stockLossBodySchema", () => {
  const loss = { productId: PRODUCT_ID, reason: "theft", quantity: 1000 };

  it("accepts a product, a loss reason and a quantity", () => {
    expect(stockLossBodySchema.safeParse(loss)).toMatchObject({ success: true, data: loss });
  });

  it.each([
    "broken_or_spilled",
    "spoiled",
    "portioning_waste",
    "tasting_or_sample",
    "store_consumption",
    "theft",
  ])("accepts the reason %s", (reason) => {
    expect(stockLossBodySchema.safeParse({ ...loss, reason }).success).toBe(true);
  });

  it.each([undefined, "", "not-a-uuid", 42])("rejects the product id %j", (productId) => {
    expect(firstIssue(stockLossBodySchema, { ...loss, productId })).toEqual({
      field: "productId",
      message: "productId must be an active product's id",
    });
  });

  it.each([undefined, "supplier_return", "count", "THEFT"])("rejects the reason %j", (reason) => {
    expect(firstIssue(stockLossBodySchema, { ...loss, reason })).toEqual({
      field: "reason",
      message: "reason must be one of the loss reasons",
    });
  });

  it("accepts the smallest and the largest quantity a movement holds", () => {
    expect(stockLossBodySchema.safeParse({ ...loss, quantity: 1 }).success).toBe(true);
    expect(stockLossBodySchema.safeParse({ ...loss, quantity: MAX_STOCK_QUANTITY }).success).toBe(
      true,
    );
  });

  it.each([undefined, 0, -1000, 1.5, "1000", MAX_STOCK_QUANTITY + 1, Number.NaN])(
    "rejects the quantity %j",
    (quantity) => {
      expect(firstIssue(stockLossBodySchema, { ...loss, quantity })).toEqual({
        field: "quantity",
        message: "quantity must be a positive integer number of thousandths",
      });
    },
  );
});

describe("stockAdjustmentBodySchema", () => {
  const adjustment = {
    productId: PRODUCT_ID,
    reason: "purchase_correction",
    direction: "add",
    quantity: 12_000,
  };

  it("accepts a product, an adjustment reason, a direction and a quantity", () => {
    expect(stockAdjustmentBodySchema.safeParse(adjustment)).toMatchObject({
      success: true,
      data: adjustment,
    });
  });

  it.each([
    ["purchase_correction", "add"],
    ["purchase_correction", "subtract"],
    ["batch_correction", "add"],
    ["batch_correction", "subtract"],
    ["supplier_return", "subtract"],
  ])("accepts a %s that goes in the %s direction", (reason, direction) => {
    expect(stockAdjustmentBodySchema.safeParse({ ...adjustment, reason, direction }).success).toBe(
      true,
    );
  });

  it("rejects adding stock returned to a supplier, on the direction", () => {
    expect(
      firstIssue(stockAdjustmentBodySchema, {
        ...adjustment,
        reason: "supplier_return",
        direction: "add",
      }),
    ).toEqual({ field: "direction", message: "this reason only subtracts" });
  });

  it.each([undefined, "theft", ""])("rejects the reason %j", (reason) => {
    expect(firstIssue(stockAdjustmentBodySchema, { ...adjustment, reason })).toEqual({
      field: "reason",
      message: "reason must be one of the adjustment reasons",
    });
  });

  it.each([undefined, "up", "ADD"])("rejects the direction %j", (direction) => {
    expect(firstIssue(stockAdjustmentBodySchema, { ...adjustment, direction })).toEqual({
      field: "direction",
      message: "direction must be add or subtract",
    });
  });

  it.each([0, 0.5, MAX_STOCK_QUANTITY + 1])("rejects the quantity %j", (quantity) => {
    expect(firstIssue(stockAdjustmentBodySchema, { ...adjustment, quantity })?.field).toBe(
      "quantity",
    );
  });

  it("rejects a bad product id", () => {
    expect(firstIssue(stockAdjustmentBodySchema, { ...adjustment, productId: "x" })?.field).toBe(
      "productId",
    );
  });
});

describe("stockAdjustmentDirectionsSchema", () => {
  it("states the directions each adjustment reason may go in", () => {
    const directions = Object.fromEntries(
      Object.entries(stockAdjustmentDirectionsSchema.shape).map(([reason, schema]) => [
        reason,
        schema.options,
      ]),
    );

    expect(directions).toEqual({
      purchase_correction: ["add", "subtract"],
      supplier_return: ["subtract"],
      batch_correction: ["add", "subtract"],
    });
  });
});

describe("stockMovementChangeSchema", () => {
  it.each([
    [{ kind: "loss", quantity: 1200 }, -1200],
    [{ kind: "adjustment", direction: "add", quantity: 250 }, 250],
    [{ kind: "adjustment", direction: "subtract", quantity: 250 }, -250],
  ])("turns %j into the change %j", (movement, change) => {
    expect(stockMovementChangeSchema.parse(movement)).toBe(change);
  });

  it.each([
    { kind: "count", quantity: 1 },
    { kind: "adjustment", quantity: 1 },
    { kind: "adjustment", direction: "up", quantity: 1 },
    { kind: "loss", quantity: "1" },
  ])("rejects %j", (movement) => {
    expect(stockMovementChangeSchema.safeParse(movement).success).toBe(false);
  });
});

describe("stockCountBodySchema", () => {
  const count = { productId: PRODUCT_ID, counted: 16_000, occurredAt: "2026-09-15T21:32:00.000Z" };

  it("accepts a product, the counted quantity and when the count happened", () => {
    expect(stockCountBodySchema.safeParse(count)).toMatchObject({ success: true, data: count });
  });

  it("accepts counting nothing and the largest quantity a count holds", () => {
    expect(stockCountBodySchema.safeParse({ ...count, counted: 0 }).success).toBe(true);
    expect(stockCountBodySchema.safeParse({ ...count, counted: MAX_STOCK_QUANTITY }).success).toBe(
      true,
    );
  });

  it.each([undefined, -1, 0.5, "16000", MAX_STOCK_QUANTITY + 1])(
    "rejects the counted quantity %j",
    (counted) => {
      expect(firstIssue(stockCountBodySchema, { ...count, counted })).toEqual({
        field: "counted",
        message: "counted must be a non-negative integer number of thousandths",
      });
    },
  );

  it.each([undefined, "", "2026-09-15", "15/09/2026 18:32", 1_758_000_000_000])(
    "rejects the moment %j",
    (occurredAt) => {
      expect(firstIssue(stockCountBodySchema, { ...count, occurredAt })).toEqual({
        field: "occurredAt",
        message: "occurredAt must be an ISO date and time",
      });
    },
  );

  it("accepts a moment with an offset", () => {
    expect(
      stockCountBodySchema.safeParse({ ...count, occurredAt: "2026-09-15T18:32:00-03:00" }).success,
    ).toBe(true);
  });

  it("rejects a bad product id", () => {
    expect(firstIssue(stockCountBodySchema, { ...count, productId: 7 })?.field).toBe("productId");
  });
});
