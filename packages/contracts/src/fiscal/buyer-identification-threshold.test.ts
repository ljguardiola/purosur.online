import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type BuyerIdentificationThresholdBody,
  buyerIdentificationThresholdListSchema,
  buyerIdentificationThresholdSchema,
} from "./buyer-identification-threshold.js";

const row = {
  id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  amount: 1_000_000,
  valid_from: "2026-01-01",
};

describe("buyerIdentificationThresholdSchema", () => {
  it("accepts a threshold with its amount in cents and the day it starts", () => {
    expect(buyerIdentificationThresholdSchema.parse(row)).toEqual(row);
  });

  it("keeps nothing but the fields the backoffice may hold", () => {
    expect(buyerIdentificationThresholdSchema.parse({ ...row, created_by: "x" })).toEqual(row);
  });

  it.each([
    ["without its id", { ...row, id: undefined }],
    ["without its amount", { ...row, amount: undefined }],
    ["with a fractional amount", { ...row, amount: 1.5 }],
    ["without its start day", { ...row, valid_from: undefined }],
  ])("refuses a threshold %s", (_case, body) => {
    expect(buyerIdentificationThresholdSchema.safeParse(body).success).toBe(false);
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<BuyerIdentificationThresholdBody["amount"]>().toEqualTypeOf<number>();
    expectTypeOf<BuyerIdentificationThresholdBody["valid_from"]>().toEqualTypeOf<string>();
  });
});

describe("buyerIdentificationThresholdListSchema", () => {
  it("accepts a list of thresholds, including an empty one", () => {
    expect(buyerIdentificationThresholdListSchema.parse([row, { ...row, id: "b" }])).toHaveLength(
      2,
    );
    expect(buyerIdentificationThresholdListSchema.parse([])).toEqual([]);
  });

  it("refuses a list holding something that is not a threshold", () => {
    expect(buyerIdentificationThresholdListSchema.safeParse([{ id: "a" }]).success).toBe(false);
  });
});
