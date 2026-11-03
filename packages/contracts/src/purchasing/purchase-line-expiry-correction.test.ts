import { describe, expect, it } from "vitest";
import { purchaseLineExpiryCorrectionBodySchema } from "./purchase-line-expiry-correction.js";

describe("purchaseLineExpiryCorrectionBodySchema", () => {
  it("accepts a calendar day", () => {
    expect(
      purchaseLineExpiryCorrectionBodySchema.safeParse({ expiresOn: "2027-11-10" }).data,
    ).toEqual({ expiresOn: "2027-11-10" });
  });

  it("accepts null, to clear the date", () => {
    expect(purchaseLineExpiryCorrectionBodySchema.safeParse({ expiresOn: null }).data).toEqual({
      expiresOn: null,
    });
  });

  it.each([undefined, "", "2027-02-30", "10/11/2027", 20271110])(
    "rejects the date %j",
    (expiresOn) => {
      const result = purchaseLineExpiryCorrectionBodySchema.safeParse({ expiresOn });

      expect(result.error?.issues[0]).toMatchObject({
        path: ["expiresOn"],
        message: "expiresOn must be a calendar day in the form YYYY-MM-DD, or null",
      });
    },
  );
});
