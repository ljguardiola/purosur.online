import { describe, expect, it } from "vitest";
import { resolveSupplierPriceListsBucketConfig } from "./supplier-price-lists-bucket-config.js";

describe("resolveSupplierPriceListsBucketConfig", () => {
  const COMPLETE = {
    SUPPLIER_PRICE_LISTS_BUCKET_ENDPOINT: "https://t3.storageapi.test",
    SUPPLIER_PRICE_LISTS_BUCKET_NAME: "supplier-price-lists-fictional",
    SUPPLIER_PRICE_LISTS_BUCKET_REGION: "auto",
    SUPPLIER_PRICE_LISTS_BUCKET_ACCESS_KEY_ID: "fictional-access-key-id",
    SUPPLIER_PRICE_LISTS_BUCKET_SECRET_ACCESS_KEY: "fictional-secret-access-key",
  };

  it("reads the supplier price lists bucket from its own variables", () => {
    expect(resolveSupplierPriceListsBucketConfig(COMPLETE)).toEqual({
      endpoint: "https://t3.storageapi.test",
      bucket: "supplier-price-lists-fictional",
      region: "auto",
      accessKeyId: "fictional-access-key-id",
      secretAccessKey: "fictional-secret-access-key",
    });
  });

  it("answers nothing when the bucket is not configured", () => {
    expect(resolveSupplierPriceListsBucketConfig({})).toBeUndefined();
  });

  it("refuses a bucket configured by halves", () => {
    expect(() =>
      resolveSupplierPriceListsBucketConfig({
        SUPPLIER_PRICE_LISTS_BUCKET_ENDPOINT: "https://t3.storageapi.test",
      }),
    ).toThrow("SUPPLIER_PRICE_LISTS_BUCKET_NAME must be set");
  });
});
