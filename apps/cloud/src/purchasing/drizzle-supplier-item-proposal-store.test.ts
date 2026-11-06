import type {
  AiCallRecord,
  KeptLinkProposal,
  KeptQuantityProposal,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supplierPriceListAiCalls, supplierPriceListRows } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierItemProposalStore } from "./drizzle-supplier-item-proposal-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertSupplier,
} from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-10-12T15:00:00.000Z");
const ASKED_FROM = {
  description: "Yerba mate 1 kg",
  presentation: "Caja x 10",
  barcode: "7790001000012",
  otherPresentations: ["Bulto", "Pack x 5"],
};
const ITEM_ASKED_FROM = {
  description: "Yerba mate 1 kg",
  presentation: null,
  otherPresentations: [],
};

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let supplierId: string;
let listId: string;
let rowId: string;
let otherRowId: string;
let productId: string;

const store = () => new DrizzleSupplierItemProposalStore(db);

function call(forListId: string = listId): AiCallRecord {
  return {
    purpose: "LINK_PROPOSAL",
    listId: forListId,
    rowId,
    actorId,
    occurredAt: NOW,
    occurredOn: "2026-10-12",
    model: "claude-sonnet-5-5",
    inputTokens: 500,
    outputTokens: 20,
    cacheWriteTokens: 0,
    cacheReadTokens: 400,
    outcome: "completed",
    costNanoUsd: 1_100_000,
  };
}

const NONE: KeptLinkProposal = { askedFrom: ASKED_FROM, answer: { kind: "none" } };
const QUANTITY_NONE: KeptQuantityProposal = {
  askedFrom: ITEM_ASKED_FROM,
  answer: { kind: "none" },
};

function keepLink(forRowId: string, kept: KeptLinkProposal) {
  return store().recordLinkProposal(forRowId, [], kept);
}

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
  locationId = await seededLocationId(db);
  supplierId = await insertSupplier(db, { actorId });
  listId = await insertPriceList(db, { supplierId, locationId, actorId, state: "EXTRACTED" });
  [rowId, otherRowId] = (await insertPriceListRows(db, listId, [{}, {}])) as [string, string];
  productId = (await insertProduct(db, { name: "Yerba 1 kg" })).id;
});

describe("the kept link proposal of a row", () => {
  it("answers nothing for a row with none kept", async () => {
    expect(await store().keptLinkProposal(rowId)).toBeUndefined();
  });

  it.each([
    { kind: "proposed", by: "ai", saleUnit: "UNIT", quantity: 36_000 },
    { kind: "proposed", by: "barcode", saleUnit: "KG", quantity: null },
  ] as const)("answers the product proposed, as kept: %j", async (answer) => {
    const kept = { askedFrom: ASKED_FROM, answer: { ...answer, productId } };
    await keepLink(rowId, kept);

    expect(await store().keptLinkProposal(rowId)).toEqual(kept);
  });

  it("answers that none fit, as kept, with the row it was asked from", async () => {
    await keepLink(rowId, NONE);

    expect(await store().keptLinkProposal(rowId)).toEqual(NONE);
  });

  it("answers a row asked from with no presentation, barcode or other presentations", async () => {
    const kept = { ...NONE, askedFrom: { ...ITEM_ASKED_FROM, barcode: null } };
    await keepLink(rowId, kept);

    expect(await store().keptLinkProposal(rowId)).toEqual(kept);
  });

  it("replaces what was kept for the row and leaves other rows alone", async () => {
    await keepLink(rowId, {
      askedFrom: ASKED_FROM,
      answer: { kind: "proposed", by: "ai", productId, saleUnit: "UNIT", quantity: 1_000 },
    });
    await keepLink(otherRowId, NONE);

    await keepLink(rowId, NONE);
    expect(await store().keptLinkProposal(rowId)).toEqual(NONE);
    const replaced = {
      askedFrom: { ...ASKED_FROM, presentation: "Caja x 20" },
      answer: { kind: "proposed", by: "barcode", productId, saleUnit: "UNIT", quantity: null },
    } as const;
    await keepLink(rowId, replaced);

    expect(await store().keptLinkProposal(rowId)).toEqual(replaced);
    expect(await store().keptLinkProposal(otherRowId)).toEqual(NONE);
    expect(await db.$count(supplierPriceListRows)).toBe(2);
  });
});

describe("the kept quantity proposal of a row", () => {
  const ML_250 = { saleUnit: "UNIT", netContent: { quantity: 250, unit: "ML" } } as const;
  const NO_NET_CONTENT = { saleUnit: "UNIT", netContent: null } as const;
  const proposed = (quantity: number): KeptQuantityProposal => ({
    askedFrom: ITEM_ASKED_FROM,
    answer: { kind: "proposed", quantity },
  });
  const keepQuantity = (shape: typeof ML_250 | typeof NO_NET_CONTENT, kept: KeptQuantityProposal) =>
    store().recordQuantityProposal(rowId, shape, [], kept);

  it("answers nothing for a shape with none kept", async () => {
    expect(await store().keptQuantityProposal(rowId, ML_250)).toBeUndefined();
  });

  it("answers the quantity kept for exactly that shape, with the item it was read from", async () => {
    const kept: KeptQuantityProposal = {
      askedFrom: { ...ITEM_ASKED_FROM, presentation: "x3 packs", otherPresentations: ["Caja"] },
      answer: { kind: "proposed", quantity: 36_000 },
    };
    await keepQuantity(ML_250, kept);

    expect(await store().keptQuantityProposal(rowId, ML_250)).toEqual(kept);
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
    await keepQuantity(ML_250, QUANTITY_NONE);

    expect(await store().keptQuantityProposal(rowId, ML_250)).toEqual(QUANTITY_NONE);
  });

  it("treats a missing net content as one value of the shape", async () => {
    await keepQuantity(NO_NET_CONTENT, proposed(1_000));
    await keepQuantity(NO_NET_CONTENT, proposed(2_000));
    await keepQuantity(ML_250, QUANTITY_NONE);

    expect(await store().keptQuantityProposal(rowId, NO_NET_CONTENT)).toEqual(proposed(2_000));
    expect(await store().keptQuantityProposal(rowId, ML_250)).toEqual(QUANTITY_NONE);
  });

  it("replaces what was kept for the shape, with the item it was read from", async () => {
    await keepQuantity(ML_250, proposed(1_000));
    await keepQuantity(ML_250, QUANTITY_NONE);
    const replaced: KeptQuantityProposal = {
      askedFrom: { ...ITEM_ASKED_FROM, description: "Yerba mate 500 g" },
      answer: { kind: "proposed", quantity: 3_000 },
    };
    await keepQuantity(ML_250, replaced);

    expect(await store().keptQuantityProposal(rowId, ML_250)).toEqual(replaced);
  });
});

describe.each([
  [
    "link",
    (calls: AiCallRecord[], kept: "none" | null) =>
      store().recordLinkProposal(rowId, calls, kept && NONE),
  ],
  [
    "quantity",
    (calls: AiCallRecord[], kept: "none" | null) =>
      store().recordQuantityProposal(
        rowId,
        { saleUnit: "KG", netContent: null },
        calls,
        kept && QUANTITY_NONE,
      ),
  ],
] as const)("recording the calls of a %s proposal", (_name, record) => {
  it("writes each call with the supplier and the branch of its list", async () => {
    expect(await record([call(), call()], "none")).toBe("recorded");

    const calls = await db.select().from(supplierPriceListAiCalls);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      listId,
      rowId,
      supplierId,
      locationId,
      actorId,
      purpose: "LINK_PROPOSAL",
      occurredOn: "2026-10-12",
      cacheReadTokens: 400,
      costNanoUsd: 1_100_000,
    });
  });

  it("writes the calls when there is no proposal to keep", async () => {
    expect(await record([call()], null)).toBe("recorded");

    expect(await db.$count(supplierPriceListAiCalls)).toBe(1);
  });

  it("writes neither the calls nor the proposal when one of the calls cannot be written", async () => {
    await expect(
      record([call(), call("00000000-0000-4000-8000-000000000000")], "none"),
    ).rejects.toThrow();

    expect(await db.$count(supplierPriceListAiCalls)).toBe(0);
    expect(await store().keptLinkProposal(rowId)).toBeUndefined();
    expect(
      await store().keptQuantityProposal(rowId, { saleUnit: "KG", netContent: null }),
    ).toBeUndefined();
  });

  it("answers row_gone, still writing the calls, when the row no longer exists", async () => {
    await db.delete(supplierPriceListRows).where(eq(supplierPriceListRows.id, rowId));

    expect(await record([call()], "none")).toBe("row_gone");

    expect(await db.$count(supplierPriceListAiCalls)).toBe(1);
    expect(await store().keptLinkProposal(rowId)).toBeUndefined();
  });
});

describe("a proposal that cannot be kept", () => {
  it("leaves the calls of its link proposal unwritten", async () => {
    await expect(
      store().recordLinkProposal(rowId, [call()], {
        askedFrom: ASKED_FROM,
        answer: {
          kind: "proposed",
          by: "ai",
          productId: "00000000-0000-4000-8000-000000000000",
          saleUnit: "UNIT",
          quantity: null,
        },
      }),
    ).rejects.toThrow();

    expect(await db.$count(supplierPriceListAiCalls)).toBe(0);
  });

  it("leaves the calls of its quantity proposal unwritten", async () => {
    await expect(
      store().recordQuantityProposal(
        rowId,
        { saleUnit: "UNIT", netContent: { quantity: 0, unit: "ML" } },
        [call()],
        QUANTITY_NONE,
      ),
    ).rejects.toThrow();

    expect(await db.$count(supplierPriceListAiCalls)).toBe(0);
  });
});

describe("the proposals of a row that is deleted", () => {
  it("are dropped with it, and only its own", async () => {
    const shape = { saleUnit: "KG", netContent: null } as const;
    await keepLink(rowId, NONE);
    await store().recordQuantityProposal(rowId, shape, [], QUANTITY_NONE);
    await keepLink(otherRowId, NONE);
    await store().recordQuantityProposal(otherRowId, shape, [], QUANTITY_NONE);

    await db.delete(supplierPriceListRows).where(eq(supplierPriceListRows.id, rowId));

    expect(await store().keptLinkProposal(rowId)).toBeUndefined();
    expect(await store().keptQuantityProposal(rowId, shape)).toBeUndefined();
    expect(await store().keptLinkProposal(otherRowId)).toEqual(NONE);
    expect(await store().keptQuantityProposal(otherRowId, shape)).toEqual(QUANTITY_NONE);
  });
});
