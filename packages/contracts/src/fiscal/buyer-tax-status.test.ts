import { describe, expect, it } from "vitest";
import { buyerTaxStatusListSchema } from "./buyer-tax-status.js";

const consumer = { code: 5, description: "Consumidor Final" };

describe("buyerTaxStatusListSchema", () => {
  it("reads the statuses with their code and description, an empty list included", () => {
    expect(buyerTaxStatusListSchema.parse([])).toEqual([]);
    expect(buyerTaxStatusListSchema.parse([consumer])).toEqual([consumer]);
  });

  it.each(["code", "description"])("refuses a status without its %s", (field) => {
    expect(buyerTaxStatusListSchema.safeParse([{ ...consumer, [field]: undefined }]).success).toBe(
      false,
    );
  });

  it("refuses a fractional code", () => {
    expect(buyerTaxStatusListSchema.safeParse([{ ...consumer, code: 5.5 }]).success).toBe(false);
  });

  it("drops what the status carries beyond its code and description", () => {
    expect(buyerTaxStatusListSchema.parse([{ ...consumer, invoiceClass: "C" }])).toEqual([
      consumer,
    ]);
  });
});
