import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  JOIN_PRODUCT_BRAND,
  SHOWN_PRODUCT_COLUMNS,
  type ShownProductColumns,
  shownProductName,
} from "./sqlite-shown-product-name";

let database: LocalDatabase;

function addProduct(
  name: string,
  options: { brandId?: string; netContent?: { quantity: number; unit: string } } = {},
): void {
  database
    .prepare(
      `INSERT INTO products (id, name, category_id, sale_unit, active, version, removed,
         brand_id, net_content_quantity, net_content_unit)
       VALUES ('p1', ?, 'c', 'UNIT', 1, 1, 0, ?, ?, ?)`,
    )
    .run(
      name,
      options.brandId ?? null,
      options.netContent?.quantity ?? null,
      options.netContent?.unit ?? null,
    );
}

function addBrand(id: string, name: string, options: { active?: boolean } = {}): void {
  database
    .prepare("INSERT INTO brands (id, name, active, version) VALUES (?, ?, ?, 1)")
    .run(id, name, options.active === false ? 0 : 1);
}

function shownName(): string | undefined {
  const row = database
    .prepare<[], ShownProductColumns>(
      `SELECT ${SHOWN_PRODUCT_COLUMNS} FROM products ${JOIN_PRODUCT_BRAND} WHERE products.id = 'p1'`,
    )
    .get();
  return row === undefined ? undefined : shownProductName(row);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

describe("the name a product is shown with", () => {
  it("follows the product's name with its brand's name and its net content", () => {
    addBrand("b1", "Vitora");
    addProduct("Aceite de Almendras", { brandId: "b1", netContent: { quantity: 30, unit: "ML" } });

    expect(shownName()).toBe("Aceite de Almendras Vitora 30 ml");
  });

  it("is the product's name alone when it has neither brand nor net content", () => {
    addProduct("Pan casero");

    expect(shownName()).toBe("Pan casero");
  });

  it("still carries the name of a deactivated brand", () => {
    addBrand("b1", "Vitora", { active: false });
    addProduct("Aceite de Almendras", { brandId: "b1" });

    expect(shownName()).toBe("Aceite de Almendras Vitora");
  });

  it("carries the brand's current name once the brand is renamed", () => {
    addBrand("b1", "Vitora");
    addProduct("Aceite de Almendras", { brandId: "b1" });
    database
      .prepare("UPDATE brands SET name = 'Vitora Natural', version = 2 WHERE id = 'b1'")
      .run();

    expect(shownName()).toBe("Aceite de Almendras Vitora Natural");
  });

  it("leaves out a brand the register has not received", () => {
    addProduct("Aceite de Almendras", { brandId: "b1", netContent: { quantity: 30, unit: "ML" } });

    expect(shownName()).toBe("Aceite de Almendras 30 ml");
  });
});
