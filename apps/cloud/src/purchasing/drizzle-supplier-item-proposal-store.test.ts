import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supplierPriceListRows } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierItemProposalStore } from "./drizzle-supplier-item-proposal-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertSupplier,
} from "./test-support/supplier-price-list-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let rowId: string;
let otherRowId: string;
let productId: string;

const store = () => new DrizzleSupplierItemProposalStore(db);

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  const supplierId = await insertSupplier(db, { actorId });
  const listId = await insertPriceList(db, { supplierId, locationId, actorId, state: "EXTRACTED" });
  [rowId, otherRowId] = (await insertPriceListRows(db, listId, [{}, {}])) as [string, string];
  productId = (await insertProduct(db, { name: "Yerba 1 kg" })).id;
});

describe("the kept link proposal of a row", () => {
  it("answers nothing for a row with none kept", async () => {
    expect(await store().keptLinkProposal(rowId)).toBeUndefined();
  });

  it.each([
    { kind: "proposed", by: "ai", quantity: 36_000 },
    { kind: "proposed", by: "barcode", quantity: null },
  ] as const)("answers the product proposed, as kept: %j", async (kept) => {
    await store().keepLinkProposal(rowId, { ...kept, productId });

    expect(await store().keptLinkProposal(rowId)).toEqual({ ...kept, productId });
  });

  it("answers that none fit, as kept", async () => {
    await store().keepLinkProposal(rowId, { kind: "none" });

    expect(await store().keptLinkProposal(rowId)).toEqual({ kind: "none" });
  });

  it("replaces what was kept for the row and leaves other rows alone", async () => {
    await store().keepLinkProposal(rowId, {
      kind: "proposed",
      by: "ai",
      productId,
      quantity: 1_000,
    });
    await store().keepLinkProposal(otherRowId, { kind: "none" });

    await store().keepLinkProposal(rowId, { kind: "none" });
    expect(await store().keptLinkProposal(rowId)).toEqual({ kind: "none" });
    await store().keepLinkProposal(rowId, {
      kind: "proposed",
      by: "barcode",
      productId,
      quantity: null,
    });

    expect(await store().keptLinkProposal(rowId)).toEqual({
      kind: "proposed",
      by: "barcode",
      productId,
      quantity: null,
    });
    expect(await store().keptLinkProposal(otherRowId)).toEqual({ kind: "none" });
    expect(await db.$count(supplierPriceListRows)).toBe(2);
  });
});

describe("the kept quantity proposal of a row", () => {
  const ML_250 = { saleUnit: "UNIT", netContent: { quantity: 250, unit: "ML" } } as const;
  const NO_NET_CONTENT = { saleUnit: "UNIT", netContent: null } as const;

  it("answers nothing for a shape with none kept", async () => {
    expect(await store().keptQuantityProposal(rowId, ML_250)).toBeUndefined();
  });

  it("answers the quantity kept for exactly that shape", async () => {
    await store().keepQuantityProposal(rowId, ML_250, { kind: "proposed", quantity: 36_000 });

    expect(await store().keptQuantityProposal(rowId, ML_250)).toEqual({
      kind: "proposed",
      quantity: 36_000,
    });
    expect(
      await store().keptQuantityProposal(rowId, {
        ...ML_250,
        netContent: { quantity: 500, unit: "ML" },
      }),
    ).toBeUndefined();
    expect(
      await store().keptQuantityProposal(rowId, {
        ...ML_250,
        netContent: { quantity: 250, unit: "G" },
      }),
    ).toBeUndefined();
    expect(
      await store().keptQuantityProposal(rowId, { ...ML_250, saleUnit: "KG" }),
    ).toBeUndefined();
    expect(await store().keptQuantityProposal(otherRowId, ML_250)).toBeUndefined();
  });

  it("answers that none was read, as kept", async () => {
    await store().keepQuantityProposal(rowId, ML_250, { kind: "none" });

    expect(await store().keptQuantityProposal(rowId, ML_250)).toEqual({ kind: "none" });
  });

  it("treats a missing net content as one value of the shape", async () => {
    await store().keepQuantityProposal(rowId, NO_NET_CONTENT, {
      kind: "proposed",
      quantity: 1_000,
    });
    await store().keepQuantityProposal(rowId, NO_NET_CONTENT, {
      kind: "proposed",
      quantity: 2_000,
    });
    await store().keepQuantityProposal(rowId, ML_250, { kind: "none" });

    expect(await store().keptQuantityProposal(rowId, NO_NET_CONTENT)).toEqual({
      kind: "proposed",
      quantity: 2_000,
    });
    expect(await store().keptQuantityProposal(rowId, ML_250)).toEqual({ kind: "none" });
  });

  it("replaces what was kept for the shape", async () => {
    await store().keepQuantityProposal(rowId, ML_250, { kind: "proposed", quantity: 1_000 });
    await store().keepQuantityProposal(rowId, ML_250, { kind: "none" });
    await store().keepQuantityProposal(rowId, ML_250, { kind: "proposed", quantity: 3_000 });

    expect(await store().keptQuantityProposal(rowId, ML_250)).toEqual({
      kind: "proposed",
      quantity: 3_000,
    });
  });
});

describe("the proposals of a row that is deleted", () => {
  it("are dropped with it, and only its own", async () => {
    const shape = { saleUnit: "KG", netContent: null } as const;
    await store().keepLinkProposal(rowId, { kind: "none" });
    await store().keepQuantityProposal(rowId, shape, { kind: "none" });
    await store().keepLinkProposal(otherRowId, { kind: "none" });
    await store().keepQuantityProposal(otherRowId, shape, { kind: "none" });

    await db.delete(supplierPriceListRows).where(eq(supplierPriceListRows.id, rowId));

    expect(await store().keptLinkProposal(rowId)).toBeUndefined();
    expect(await store().keptQuantityProposal(rowId, shape)).toBeUndefined();
    expect(await store().keptLinkProposal(otherRowId)).toEqual({ kind: "none" });
    expect(await store().keptQuantityProposal(otherRowId, shape)).toEqual({ kind: "none" });
  });
});
