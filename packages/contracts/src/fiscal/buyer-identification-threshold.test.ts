import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type BuyerIdentificationThresholdBody,
  buyerIdentificationThresholdConfirmationRequiredSchema,
  buyerIdentificationThresholdOverviewSchema,
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

describe("buyerIdentificationThresholdOverviewSchema", () => {
  const overview = { in_effect: row, scheduled: null, earliest_valid_from: "2026-01-01" };

  it("accepts the threshold in effect, the scheduled one and the earliest day a threshold may start", () => {
    const scheduled = { ...row, id: "b", valid_from: "2026-06-01" };

    expect(
      buyerIdentificationThresholdOverviewSchema.parse({
        in_effect: row,
        scheduled,
        earliest_valid_from: "2026-01-01",
      }),
    ).toEqual({ in_effect: row, scheduled, earliest_valid_from: "2026-01-01" });
  });

  it("accepts an overview with nothing in effect and nothing scheduled", () => {
    const empty = { in_effect: null, scheduled: null, earliest_valid_from: "2026-01-01" };

    expect(buyerIdentificationThresholdOverviewSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ["without in_effect", { ...overview, in_effect: undefined }],
    ["without scheduled", { ...overview, scheduled: undefined }],
    ["without earliest_valid_from", { ...overview, earliest_valid_from: undefined }],
    ["with a null earliest_valid_from", { ...overview, earliest_valid_from: null }],
    ["with an in_effect that is not a threshold", { ...overview, in_effect: { id: "a" } }],
    ["with a scheduled that is not a threshold", { ...overview, scheduled: { id: "a" } }],
    [
      "with an earliest_valid_from that is not text",
      { ...overview, earliest_valid_from: 20260101 },
    ],
  ])("refuses an overview %s", (_case, body) => {
    expect(buyerIdentificationThresholdOverviewSchema.safeParse(body).success).toBe(false);
  });

  it("keeps nothing but the fields the backoffice may hold", () => {
    expect(
      buyerIdentificationThresholdOverviewSchema.parse({ ...overview, created_by: "x" }),
    ).toEqual(overview);
  });
});

describe("buyerIdentificationThresholdConfirmationRequiredSchema", () => {
  const answer = {
    code: "threshold_lower_than_in_effect",
    message: "the amount is lower than the one in effect",
    in_effect_amount: 2_000_000,
    amount: 10_000,
    valid_from: "2026-10-01",
  };

  it("accepts the amount in effect, the new amount and the day it takes effect", () => {
    expect(buyerIdentificationThresholdConfirmationRequiredSchema.parse(answer)).toEqual(answer);
  });

  it.each([
    ["another code", { ...answer, code: "threshold_before_today" }],
    ["no in-effect amount", { ...answer, in_effect_amount: undefined }],
    ["a fractional in-effect amount", { ...answer, in_effect_amount: 1.5 }],
    ["no amount", { ...answer, amount: undefined }],
    ["a fractional amount", { ...answer, amount: 1.5 }],
    ["no start day", { ...answer, valid_from: undefined }],
  ])("refuses an answer with %s", (_case, body) => {
    expect(buyerIdentificationThresholdConfirmationRequiredSchema.safeParse(body).success).toBe(
      false,
    );
  });
});
