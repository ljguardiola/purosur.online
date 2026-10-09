import { describe, expect, it } from "vitest";
import { buyerIdentificationThresholdRecordBodySchema } from "./buyer-identification-threshold-record.js";

const AMOUNT_MESSAGE = "amount must be a positive integer number of cents";
const VALID_FROM_MESSAGE = "valid_from must be a valid ISO calendar date (YYYY-MM-DD)";

function failure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = buyerIdentificationThresholdRecordBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("buyerIdentificationThresholdRecordBodySchema", () => {
  it("accepts an amount in cents and the day it starts", () => {
    expect(
      buyerIdentificationThresholdRecordBodySchema.parse({
        amount: 1_000_000,
        valid_from: "2026-10-01",
      }),
    ).toEqual({ amount: 1_000_000, valid_from: "2026-10-01", confirm_lower_than_in_effect: false });
  });

  it("carries the confirmation of a lower amount than the one in effect", () => {
    expect(
      buyerIdentificationThresholdRecordBodySchema.parse({
        amount: 10_000,
        valid_from: "2026-10-01",
        confirm_lower_than_in_effect: true,
      }),
    ).toEqual({ amount: 10_000, valid_from: "2026-10-01", confirm_lower_than_in_effect: true });
  });

  it.each([["text", "yes"], ["a number", 1]])(
    "refuses a confirmation that is %s, naming the field",
    (_case, confirm) => {
      expect(
        failure({ amount: 100, valid_from: "2026-10-01", confirm_lower_than_in_effect: confirm }),
      ).toMatchObject({ field: "confirm_lower_than_in_effect" });
    },
  );

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["negative", -5],
    ["fractional", 10.5],
    ["text", "1000"],
    ["beyond a safe integer", Number.MAX_SAFE_INTEGER + 1],
  ])("refuses an amount that is %s, naming the field", (_case, amount) => {
    expect(failure({ amount, valid_from: "2026-10-01" })).toEqual({
      field: "amount",
      message: AMOUNT_MESSAGE,
    });
  });

  it.each([
    ["missing", undefined],
    ["not a day", "soon"],
    ["a day that does not exist", "2026-02-30"],
    ["not zero-padded", "2026-1-5"],
    ["a number", 20261001],
  ])("refuses a valid_from that is %s, naming the field", (_case, validFrom) => {
    expect(failure({ amount: 100, valid_from: validFrom })).toEqual({
      field: "valid_from",
      message: VALID_FROM_MESSAGE,
    });
  });
});
