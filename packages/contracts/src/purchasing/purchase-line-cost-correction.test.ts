import { describe, expect, it } from "vitest";
import { purchaseLineCostCorrectionBodySchema } from "./purchase-line-cost-correction.js";

describe("purchaseLineCostCorrectionBodySchema", () => {
  it.each([0, 1_450_050])("accepts the cost %j", (costPaidCents) => {
    expect(purchaseLineCostCorrectionBodySchema.safeParse({ costPaidCents }).data).toEqual({
      costPaidCents,
    });
  });

  it.each([undefined, null, "100", -1, 1.5, Number.NaN])("rejects the cost %j", (costPaidCents) => {
    const result = purchaseLineCostCorrectionBodySchema.safeParse({ costPaidCents });

    expect(result.error?.issues[0]).toMatchObject({
      path: ["costPaidCents"],
      message: "costPaidCents must be a whole number of cents, not negative",
    });
  });
});
