import { SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { supplierPriceListUploadQuerySchema } from "./supplier-price-list-upload-query.js";

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";

describe("supplierPriceListUploadQuerySchema", () => {
  it("reads the supplier and the trimmed file name", () => {
    expect(
      supplierPriceListUploadQuerySchema.parse({
        supplierId: SUPPLIER_ID,
        fileName: "  lista-septiembre.pdf ",
      }),
    ).toEqual({ supplierId: SUPPLIER_ID, fileName: "lista-septiembre.pdf" });
  });

  it("refuses a supplier that is not a record id", () => {
    expect(
      supplierPriceListUploadQuerySchema.safeParse({ supplierId: "x", fileName: "a.pdf" }).success,
    ).toBe(false);
  });

  it("refuses a missing or blank file name", () => {
    expect(supplierPriceListUploadQuerySchema.safeParse({ supplierId: SUPPLIER_ID }).success).toBe(
      false,
    );
    expect(
      supplierPriceListUploadQuerySchema.safeParse({ supplierId: SUPPLIER_ID, fileName: "  " })
        .success,
    ).toBe(false);
  });

  it("accepts a file name of the maximum length and refuses a longer one", () => {
    const query = (length: number) => ({
      supplierId: SUPPLIER_ID,
      fileName: "a".repeat(length),
    });

    expect(
      supplierPriceListUploadQuerySchema.safeParse(query(SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH))
        .success,
    ).toBe(true);
    expect(
      supplierPriceListUploadQuerySchema.safeParse(
        query(SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH + 1),
      ).success,
    ).toBe(false);
  });
});
