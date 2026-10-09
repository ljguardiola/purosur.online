import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { productPackagings, suppliers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePurchasingListReader } from "./drizzle-purchasing-list-reader.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = await insertActor(db);
});

describe("DrizzlePurchasingListReader", () => {
  it("lists every supplier, deactivated ones included, by name", async () => {
    await db.insert(suppliers).values([
      { name: "Zeta", cuit: FICTIONAL_CUIT, active: false, actorId },
      {
        name: "Alfa",
        cuit: ANOTHER_FICTIONAL_CUIT,
        contact: "Marta",
        note: "Martes",
        version: 3,
        actorId,
      },
    ]);

    const listed = await new DrizzlePurchasingListReader(db).suppliers();

    expect(listed).toEqual([
      {
        id: expect.any(String),
        name: "Alfa",
        cuit: ANOTHER_FICTIONAL_CUIT,
        contact: "Marta",
        note: "Martes",
        active: true,
        version: 3,
      },
      {
        id: expect.any(String),
        name: "Zeta",
        cuit: FICTIONAL_CUIT,
        contact: null,
        note: null,
        active: false,
        version: 1,
      },
    ]);
  });

  it("lists every packaging with its product's name and sale unit, those of a deactivated product included", async () => {
    const arroz = await insertProduct(db, { name: "Arroz", saleUnit: "UNIT" });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG", active: false });
    await db.insert(productPackagings).values([
      { productId: harina.id, name: "Bolsa", quantityPerPackage: 25_000, active: false, actorId },
      { productId: arroz.id, name: "Caja", quantityPerPackage: 12_000, actorId },
    ]);

    const listed = await new DrizzlePurchasingListReader(db).packagings();

    expect(listed).toEqual([
      {
        id: expect.any(String),
        productId: harina.id,
        productName: "Harina",
        saleUnit: "KG",
        name: "Bolsa",
        quantityPerPackage: 25_000,
        active: false,
        version: 1,
      },
      {
        id: expect.any(String),
        productId: arroz.id,
        productName: "Arroz",
        saleUnit: "UNIT",
        name: "Caja",
        quantityPerPackage: 12_000,
        active: true,
        version: 1,
      },
    ]);
  });

  it("finds one packaging with its product's name and sale unit, and none that does not exist", async () => {
    const arroz = await insertProduct(db, { name: "Arroz" });
    const [caja] = await db
      .insert(productPackagings)
      .values([
        { productId: arroz.id, name: "Caja", quantityPerPackage: 12_000, actorId },
        { productId: arroz.id, name: "Bolsa", quantityPerPackage: 6_000, actorId },
      ])
      .returning({ id: productPackagings.id });
    const reader = new DrizzlePurchasingListReader(db);

    expect(await reader.packaging(caja?.id ?? "")).toMatchObject({
      id: caja?.id,
      name: "Caja",
      productName: "Arroz",
      saleUnit: "UNIT",
    });
    expect(await reader.packaging("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it.each([
    ["active", ["Activo"]],
    ["inactive", ["Inactivo"]],
    ["any", ["Activo", "Inactivo"]],
  ] as const)("offers the %s products by name", async (scope, names) => {
    await insertProduct(db, { name: "Inactivo", active: false });
    await insertProduct(db, { name: "Activo", saleUnit: "KG" });

    const listed = await new DrizzlePurchasingListReader(db).products(scope);

    expect(listed.map((product) => product.name)).toEqual(names);
    expect(listed[0]).toEqual({
      id: expect.any(String),
      name: names[0],
      saleUnit: names[0] === "Activo" ? "KG" : "UNIT",
    });
  });
});
