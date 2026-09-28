import { describe, expect, it } from "vitest";
import { priceConfirmationBodySchema } from "./price-confirmation.js";

const PRICE_ID = "11111111-1111-1111-1111-111111111111";

function firstIssue(body: unknown): { field: unknown; message: string } | undefined {
  const result = priceConfirmationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("priceConfirmationBodySchema", () => {
  it("accepts the id of the price being confirmed", () => {
    expect(
      priceConfirmationBodySchema.safeParse({ expectedCurrentPriceId: PRICE_ID }),
    ).toMatchObject({ success: true, data: { expectedCurrentPriceId: PRICE_ID } });
  });

  it.each([undefined, null, "", "not-a-uuid", 42, `${PRICE_ID}0`, ` ${PRICE_ID}`])(
    "rejects the expected current price id %j",
    (expectedCurrentPriceId) => {
      expect(firstIssue({ expectedCurrentPriceId })).toEqual({
        field: "expectedCurrentPriceId",
        message: "expectedCurrentPriceId must be an existing price's id",
      });
    },
  );

  it("accepts an id in upper case and one with unusual version and variant digits", () => {
    expect(
      priceConfirmationBodySchema.safeParse({ expectedCurrentPriceId: PRICE_ID.toUpperCase() })
        .success,
    ).toBe(true);
    expect(
      priceConfirmationBodySchema.safeParse({
        expectedCurrentPriceId: "00000000-0000-0000-0000-000000000000",
      }).success,
    ).toBe(true);
  });
});
