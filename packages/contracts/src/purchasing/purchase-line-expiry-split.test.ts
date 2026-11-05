import { describe, expect, it } from "vitest";
import { purchaseLineExpirySplitBodySchema } from "./purchase-line-expiry-split.js";

describe("purchaseLineExpirySplitBodySchema", () => {
  it("accepts a whole number of units and a calendar day", () => {
    expect(
      purchaseLineExpirySplitBodySchema.safeParse({ quantity: 1_000, expiresOn: "2027-11-10" })
        .data,
    ).toEqual({ quantity: 1_000, expiresOn: "2027-11-10" });
  });

  it("accepts null, for units without an expiry date", () => {
    expect(
      purchaseLineExpirySplitBodySchema.safeParse({ quantity: 1_000, expiresOn: null }).data,
    ).toEqual({ quantity: 1_000, expiresOn: null });
  });

  it.each([undefined, 0, -1_000, 1.5, "1000", null])("rejects the quantity %j", (quantity) => {
    const result = purchaseLineExpirySplitBodySchema.safeParse({
      quantity,
      expiresOn: "2027-11-10",
    });

    expect(result.error?.issues[0]?.path).toEqual(["quantity"]);
  });

  it.each([undefined, "", "2027-02-30", "10/11/2027", 20271110])(
    "rejects the date %j",
    (expiresOn) => {
      const result = purchaseLineExpirySplitBodySchema.safeParse({ quantity: 1_000, expiresOn });

      expect(result.error?.issues[0]).toMatchObject({
        path: ["expiresOn"],
        message: "expiresOn must be a calendar day in the form YYYY-MM-DD, or null",
      });
    },
  );
});
