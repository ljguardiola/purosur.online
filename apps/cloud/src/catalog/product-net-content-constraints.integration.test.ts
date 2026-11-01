import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { products } from "../platform/db/schema.js";
import { constraintViolatedBy } from "../test-support/constraint-violated-by.js";
import {
  openProductConstraintsDatabase,
  type ProductConstraintsDatabase,
} from "./test-support/product-constraints-database.js";

let database: ProductConstraintsDatabase;

beforeAll(async () => {
  database = await openProductConstraintsDatabase("product_net_content_constraints");
}, 60_000);

afterAll(async () => {
  await database.close();
});

describe("the products table's net content constraints on a real Postgres", () => {
  it("rejects a quantity set without a unit", async () => {
    await expect(
      database.db.insert(products).values({
        name: "Alpiste",
        categoryId: database.categoryId,
        saleUnit: "KG",
        netContentQuantity: 1.5,
        netContentUnit: null,
      }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "products_net_content_both_or_neither_check"),
    );
  });

  it("rejects a unit set without a quantity", async () => {
    await expect(
      database.db.insert(products).values({
        name: "Alpiste",
        categoryId: database.categoryId,
        saleUnit: "KG",
        netContentQuantity: null,
        netContentUnit: "KG",
      }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "products_net_content_both_or_neither_check"),
    );
  });

  it("rejects a non-positive quantity", async () => {
    await expect(
      database.db.insert(products).values({
        name: "Alpiste",
        categoryId: database.categoryId,
        saleUnit: "KG",
        netContentQuantity: 0,
        netContentUnit: "KG",
      }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "products_net_content_quantity_positive_check"),
    );
  });

  it("rejects an unknown unit", async () => {
    await expect(
      database.db.insert(products).values({
        name: "Alpiste",
        categoryId: database.categoryId,
        saleUnit: "KG",
        netContentQuantity: 1.5,
        netContentUnit: "LB",
      }),
    ).rejects.toSatisfy((error) => constraintViolatedBy(error, "products_net_content_unit_check"));
  });
});
