import { describe, expect, it } from "vitest";
import { supplierPriceListRereadStartedSchema } from "./supplier-price-list-reread-started.js";

describe("supplierPriceListRereadStartedSchema", () => {
  it("reads the id of the list whose page is being read again", () => {
    expect(supplierPriceListRereadStartedSchema.parse({ listId: "list-1" })).toEqual({
      listId: "list-1",
    });
  });

  it.each([
    ["no list id", {}],
    ["a list id that is not text", { listId: 7 }],
  ])("refuses %s", (_name, body) => {
    expect(supplierPriceListRereadStartedSchema.safeParse(body).success).toBe(false);
  });
});
