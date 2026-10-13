import { describe, expect, it } from "vitest";
import {
  assemblyBatchListSchema,
  assemblyBatchPreviewSchema,
  assemblyBatchRefusalSchema,
  assemblyBatchResultSchema,
} from "./assembly-batch-answers.js";

const batch = {
  id: "b-1",
  productId: "p-1",
  productName: "Mix de frutos secos",
  saleUnit: "KG",
  assembledAt: "2026-05-04T13:00:00.000Z",
  output: 14_000,
  unitCostCents: 3_586,
  costIncomplete: false,
  expiresOn: "2027-01-15",
  lines: [{ componentProductId: "p-2", name: "Nueces", saleUnit: "KG", quantity: 12_000 }],
};

describe("assemblyBatchResultSchema", () => {
  const result = {
    id: "b-1",
    productId: "p-1",
    assembledAt: "2026-05-04T13:00:00.000Z",
    output: 14_000,
    unitCostCents: null,
    costIncomplete: true,
    expiresOn: null,
  };

  it("accepts a batch with an incomplete cost, no unit cost and no expiry", () => {
    expect(assemblyBatchResultSchema.safeParse({ batch: result }).data).toEqual({ batch: result });
  });

  it.each([
    "id",
    "productId",
    "assembledAt",
    "output",
    "unitCostCents",
    "costIncomplete",
    "expiresOn",
  ])("rejects a batch without %s", (key) => {
    expect(
      assemblyBatchResultSchema.safeParse({ batch: { ...result, [key]: undefined } }).success,
    ).toBe(false);
  });

  it("rejects a moment that is not an ISO date and time", () => {
    expect(
      assemblyBatchResultSchema.safeParse({ batch: { ...result, assembledAt: "yesterday" } })
        .success,
    ).toBe(false);
  });

  it("rejects an expiry that is not a calendar day", () => {
    expect(
      assemblyBatchResultSchema.safeParse({ batch: { ...result, expiresOn: "2027-02-30" } })
        .success,
    ).toBe(false);
  });
});

describe("assemblyBatchListSchema", () => {
  it("accepts the batches with the components they used", () => {
    expect(assemblyBatchListSchema.safeParse({ batches: [batch] }).data).toEqual({
      batches: [batch],
    });
  });

  it("accepts no batches", () => {
    expect(assemblyBatchListSchema.safeParse({ batches: [] }).success).toBe(true);
  });

  it.each([
    "id",
    "productId",
    "productName",
    "saleUnit",
    "assembledAt",
    "output",
    "unitCostCents",
    "costIncomplete",
    "expiresOn",
    "lines",
  ])("rejects a batch without %s", (key) => {
    expect(
      assemblyBatchListSchema.safeParse({ batches: [{ ...batch, [key]: undefined }] }).success,
    ).toBe(false);
  });

  it.each(["componentProductId", "name", "saleUnit", "quantity"])(
    "rejects a line without %s",
    (key) => {
      const [line] = batch.lines;
      expect(
        assemblyBatchListSchema.safeParse({
          batches: [{ ...batch, lines: [{ ...line, [key]: undefined }] }],
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a sale unit other than the unit or the kilo", () => {
    expect(
      assemblyBatchListSchema.safeParse({ batches: [{ ...batch, saleUnit: "LITER" }] }).success,
    ).toBe(false);
  });
});

describe("assemblyBatchPreviewSchema", () => {
  const preview = {
    recipeVersion: 2,
    proposal: { used: [{ componentProductId: "p-2", quantity: 6_000 }], output: null },
    used: [{ componentProductId: "p-2", quantity: 6_000 }],
    planned: [
      {
        componentProductId: "p-2",
        allocations: [
          { lotId: "l-1", quantity: 5_000, expiresOn: "2027-01-15" },
          { lotId: null, quantity: 1_000, expiresOn: null },
        ],
      },
    ],
    lot: {
      costTotalCents: 21_000,
      costQuantity: 10_000,
      unitCostCents: 2_100,
      costIncomplete: false,
      expiresOn: "2027-01-15",
    },
  };

  it("accepts a preview whose planned allocations may fall on a lot to open", () => {
    expect(assemblyBatchPreviewSchema.safeParse(preview).data).toEqual(preview);
  });

  it("accepts a preview without a lot while there is no output to cost it by", () => {
    expect(assemblyBatchPreviewSchema.safeParse({ ...preview, lot: null }).success).toBe(true);
  });

  it("accepts a proposed output", () => {
    expect(
      assemblyBatchPreviewSchema.safeParse({
        ...preview,
        proposal: { ...preview.proposal, output: 6_000 },
      }).success,
    ).toBe(true);
  });

  it.each(["recipeVersion", "proposal", "used", "planned", "lot"])(
    "rejects a preview without %s",
    (key) => {
      expect(assemblyBatchPreviewSchema.safeParse({ ...preview, [key]: undefined }).success).toBe(
        false,
      );
    },
  );

  it.each(["costTotalCents", "costQuantity", "unitCostCents", "costIncomplete", "expiresOn"])(
    "rejects a lot without %s",
    (key) => {
      expect(
        assemblyBatchPreviewSchema.safeParse({
          ...preview,
          lot: { ...preview.lot, [key]: undefined },
        }).success,
      ).toBe(false);
    },
  );

  it("rejects an allocation without its lot, its quantity or its expiry", () => {
    for (const key of ["lotId", "quantity", "expiresOn"]) {
      const [first] = preview.planned[0]?.allocations ?? [];
      expect(
        assemblyBatchPreviewSchema.safeParse({
          ...preview,
          planned: [{ componentProductId: "p-2", allocations: [{ ...first, [key]: undefined }] }],
        }).success,
      ).toBe(false);
    }
  });
});

describe("assemblyBatchRefusalSchema", () => {
  const message = "refused";

  it.each([
    { code: "product_not_found", message },
    { code: "no_recipe", message },
    { code: "stale_recipe", message },
    { code: "invalid_size", message },
    { code: "nothing_used", message },
    { code: "invalid_output", message },
    { code: "invalid_quantity", message, componentProductId: "p-2" },
  ])("accepts the refusal $code as the cloud sends it", (refusal) => {
    expect(assemblyBatchRefusalSchema.safeParse(refusal).data).toEqual(refusal);
  });

  it.each([
    [{ code: "invalid_quantity", message }],
    [{ code: "recorded", message }],
    [{ code: "stale_recipe" }],
  ])("rejects the body %j", (body) => {
    expect(assemblyBatchRefusalSchema.safeParse(body).success).toBe(false);
  });
});
