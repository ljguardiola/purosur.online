import { describe, expect, it } from "vitest";
import { purchaseLinesAdditionBodySchema } from "./purchase-lines-addition.js";
import { purchaseRegistrationBodySchema } from "./purchase-registration.js";

const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

const packagesLine = {
  loadedBy: "packages",
  productId: PRODUCT_ID,
  packages: 2,
  quantityPerPackage: 12_000,
  costPaidCents: 1_450_050,
  lotNumber: "L-17",
  expiresOn: "2027-01-31",
};
const quantityLine = {
  loadedBy: "quantity",
  productId: PRODUCT_ID,
  quantity: 2_500,
  costPaidCents: 90_000,
  lotNumber: null,
  expiresOn: null,
};

function firstFailure(body: unknown): { path: unknown[]; message: string } | undefined {
  const result = purchaseLinesAdditionBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("purchaseLinesAdditionBodySchema", () => {
  it("accepts lines loaded by packages and by quantity", () => {
    const body = { lines: [packagesLine, quantityLine] };

    expect(purchaseLinesAdditionBodySchema.safeParse(body).data).toEqual(body);
  });

  it("rejects no lines", () => {
    expect(firstFailure({ lines: [] })?.path).toEqual(["lines"]);
  });

  it("rejects a missing list of lines", () => {
    expect(firstFailure({})?.path).toEqual(["lines"]);
  });

  it("refuses a line with the same messages as the registration", () => {
    const badLine = { ...quantityLine, quantity: 0 };
    const registration = purchaseRegistrationBodySchema.safeParse({
      supplierId: "11111111-1111-1111-1111-111111111111",
      purchasedOn: "2026-03-09",
      receiptType: "remito",
      receiptNumber: "1",
      note: null,
      lines: [badLine],
    });

    expect(firstFailure({ lines: [badLine] })).toEqual({
      path: ["lines", 0, "quantity"],
      message: registration.error?.issues[0]?.message,
    });
  });

  it("reads a line's product id in lower case, like the registration", () => {
    const parsed = purchaseLinesAdditionBodySchema.parse({
      lines: [{ ...quantityLine, productId: PRODUCT_ID.replace(/2/g, "A") }],
    });

    expect(parsed.lines[0]?.productId).toBe(PRODUCT_ID);
  });
});
