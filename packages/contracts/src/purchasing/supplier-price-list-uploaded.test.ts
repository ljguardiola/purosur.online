import { describe, expect, it } from "vitest";
import { supplierPriceListUploadedSchema } from "./supplier-price-list-uploaded.js";

describe("supplierPriceListUploadedSchema", () => {
  it("reads the id of the uploaded list", () => {
    expect(supplierPriceListUploadedSchema.parse({ listId: "list-1" })).toEqual({
      listId: "list-1",
    });
  });

  it.each([
    ["no list id", {}],
    ["a list id that is not text", { listId: 7 }],
  ])("refuses %s", (_name, body) => {
    expect(supplierPriceListUploadedSchema.safeParse(body).success).toBe(false);
  });
});
