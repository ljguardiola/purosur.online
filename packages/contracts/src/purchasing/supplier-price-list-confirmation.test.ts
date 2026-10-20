import { describe, expect, it } from "vitest";
import { supplierPriceListConfirmationBodySchema } from "./supplier-price-list-confirmation.js";

describe("supplierPriceListConfirmationBodySchema", () => {
  it("reads the version loaded and the date typed in the review", () => {
    expect(
      supplierPriceListConfirmationBodySchema.safeParse({ version: 2, listDate: "2026-03-01" })
        .data,
    ).toEqual({ version: 2, listDate: "2026-03-01" });
  });

  it.each([undefined, null, "", "  "])("reads %j as no date typed", (listDate) => {
    expect(
      supplierPriceListConfirmationBodySchema.safeParse({ version: 2, listDate }).data,
    ).toEqual({ version: 2, listDate: null });
  });

  it("trims the date", () => {
    expect(
      supplierPriceListConfirmationBodySchema.safeParse({ version: 2, listDate: " 2026-03-01 " })
        .data?.listDate,
    ).toBe("2026-03-01");
  });

  it.each(["2026-02-30", "01/03/2026", "2026-3-1", "ayer", 20260301])(
    "rejects the date %j",
    (listDate) => {
      const result = supplierPriceListConfirmationBodySchema.safeParse({ version: 2, listDate });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({
        path: ["listDate"],
        message: "listDate must be a calendar day in the form YYYY-MM-DD",
      });
    },
  );

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    const result = supplierPriceListConfirmationBodySchema.safeParse({ version });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["version"]);
  });
});
