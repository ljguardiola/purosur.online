import {
  createPackaging,
  createSupplier,
  type RegisterPurchaseInput,
  registerPurchase,
} from "@purosur/domain/purchasing/use-cases";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  branchSettings,
  lots,
  priceLists,
  priceReviewPostponements,
  purchaseLines,
  purchases,
  stockBalances,
  stockMovements,
} from "../platform/db/schema.js";
import { insertMovement } from "../stock/test-support/stock-route-fixtures.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

const RECORDED_AT = new Date("2026-10-02T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;

const store = () => new DrizzlePurchasingStore(db, () => RECORDED_AT);

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
});

async function newSupplier(): Promise<string> {
  const outcome = await createSupplier(store(), {
    name: "Distribuidora Sur",
    cuit: null,
    contact: null,
    note: null,
    actorId,
  });
  if (outcome.kind !== "created") {
    throw new Error(`test setup: creating the supplier ended as ${outcome.kind}`);
  }
  return outcome.supplier.id;
}

async function newPackaging(productId: string): Promise<string> {
  const outcome = await createPackaging(store(), {
    productId,
    name: "Caja x 12",
    quantityPerPackage: 12_000,
    actorId,
  });
  if (outcome.kind !== "created") {
    throw new Error(`test setup: creating the packaging ended as ${outcome.kind}`);
  }
  return outcome.packaging.id;
}

async function register(
  supplierId: string,
  lines: RegisterPurchaseInput["lines"],
  receipt: Pick<RegisterPurchaseInput, "receiptType" | "receiptNumber"> = {
    receiptType: "factura_b",
    receiptNumber: "0001-00000042",
  },
) {
  const outcome = await registerPurchase(
    { store: store(), clock: { now: () => RECORDED_AT } },
    {
      supplierId,
      purchasedOn: "2026-10-01",
      ...receipt,
      note: "Entrega de la mañana",
      lines,
      actorId,
      locationId,
    },
  );
  if (outcome.kind !== "registered") {
    throw new Error(`test setup: registering the purchase ended as ${outcome.kind}`);
  }
  return outcome.purchase;
}

describe("the purchases a purchasing store keeps", () => {
  it("stores the purchase, each line with its exact cost pair, and the lot each line created", async () => {
    const supplierId = await newSupplier();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const packagingId = await newPackaging(yerba.id);

    const purchase = await register(supplierId, [
      {
        loadedBy: "packaging",
        productId: yerba.id,
        packagingId,
        packages: 2,
        costPaidCents: 24_000,
        lotNumber: "L-77",
        expiresOn: "2027-03-01",
      },
      {
        loadedBy: "quantity",
        productId: harina.id,
        quantity: 2_500,
        costPaidCents: 1_000,
        lotNumber: null,
        expiresOn: null,
      },
    ]);

    const [row] = await db.select().from(purchases).where(eq(purchases.id, purchase.id));
    expect(row).toMatchObject({
      supplierId,
      locationId,
      purchasedOn: "2026-10-01",
      receiptType: "factura_b",
      receiptNumber: "0001-00000042",
      note: "Entrega de la mañana",
      recordedAt: RECORDED_AT,
      actorId,
    });
    const lines = await db.select().from(purchaseLines).orderBy(asc(purchaseLines.quantity));
    expect(lines).toMatchObject([
      {
        position: 2,
        productId: harina.id,
        packagingId: null,
        packages: null,
        quantity: 2_500,
        costPaidCents: 1_000,
        quantityPerPackage: 1_000,
      },
      {
        position: 1,
        productId: yerba.id,
        packagingId,
        packages: 2,
        quantity: 24_000,
        costPaidCents: 24_000,
        quantityPerPackage: 12_000,
        lotNumber: "L-77",
        expiresOn: "2027-03-01",
      },
    ]);
    const storedLots = await db.select().from(lots).orderBy(asc(lots.quantityReceived));
    expect(storedLots).toMatchObject([
      {
        productId: harina.id,
        locationId,
        purchaseLineId: lines[0]?.id,
        quantityReceived: 2_500,
        costTotalCents: 1_000,
        costQuantity: 1_000,
        lotNumber: null,
        expiresOn: null,
      },
      {
        productId: yerba.id,
        locationId,
        purchaseLineId: lines[1]?.id,
        quantityReceived: 24_000,
        costTotalCents: 24_000,
        costQuantity: 12_000,
        lotNumber: "L-77",
        expiresOn: "2027-03-01",
      },
    ]);
  });

  it("stores a purchase without a receipt with no receipt number", async () => {
    const supplierId = await newSupplier();
    const product = await insertProduct(db, { name: "Yerba" });

    const purchase = await register(
      supplierId,
      [
        {
          loadedBy: "quantity",
          productId: product.id,
          quantity: 1_000,
          costPaidCents: 500,
          lotNumber: null,
          expiresOn: null,
        },
      ],
      { receiptType: "sin_comprobante", receiptNumber: null },
    );

    const [row] = await db.select().from(purchases).where(eq(purchases.id, purchase.id));
    expect(row).toMatchObject({ receiptType: "sin_comprobante", receiptNumber: null });
  });

  it("records a receipt movement per line, grows the balance by the line's quantity, and logs the movement for the branch's registers", async () => {
    const supplierId = await newSupplier();
    const product = await insertProduct(db, { name: "Yerba" });
    await db.insert(stockBalances).values({ productId: product.id, locationId, quantity: 5_000 });
    const since = await lastLoggedChangeSeq(db);

    await register(supplierId, [
      {
        loadedBy: "quantity",
        productId: product.id,
        quantity: 3_000,
        costPaidCents: 900,
        lotNumber: null,
        expiresOn: null,
      },
    ]);

    const [line] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
    const movements = await db.select().from(stockMovements);
    expect(movements).toMatchObject([
      {
        productId: product.id,
        locationId,
        kind: "receipt",
        reason: null,
        delta: 3_000,
        occurredAt: RECORDED_AT,
        actorId,
        purchaseLineId: line?.id,
        supersededByCountId: null,
      },
    ]);
    const [balance] = await db
      .select({ quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(eq(stockBalances.productId, product.id));
    expect(balance?.quantity).toBe(8_000);
    expect(await changesLoggedAfter(db, since)).toEqual([
      {
        entity: "stock_movement",
        entityId: movements[0]?.id,
        version: 1,
        op: "insert",
        locationId,
      },
    ]);
  });

  it("starts the balance of a product that had none", async () => {
    const supplierId = await newSupplier();
    const product = await insertProduct(db, { name: "Yerba" });

    await register(supplierId, [
      {
        loadedBy: "quantity",
        productId: product.id,
        quantity: 3_000,
        costPaidCents: 900,
        lotNumber: null,
        expiresOn: null,
      },
    ]);

    const [balance] = await db
      .select({ quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(eq(stockBalances.productId, product.id));
    expect(balance?.quantity).toBe(3_000);
  });

  it("marks a receipt covered by a later count as superseded and leaves the balance alone", async () => {
    const supplierId = await newSupplier();
    const product = await insertProduct(db, { name: "Yerba" });
    await db.insert(stockBalances).values({ productId: product.id, locationId, quantity: 5_000 });
    const countId = await insertMovement(db, {
      productId: product.id,
      locationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt: new Date("2026-10-02T13:00:00.000Z"),
      count: { counted: 5_000, expected: 5_000 },
    });

    await register(supplierId, [
      {
        loadedBy: "quantity",
        productId: product.id,
        quantity: 3_000,
        costPaidCents: 900,
        lotNumber: null,
        expiresOn: null,
      },
    ]);

    const [receipt] = await db
      .select({ supersededByCountId: stockMovements.supersededByCountId })
      .from(stockMovements)
      .where(eq(stockMovements.kind, "receipt"));
    expect(receipt?.supersededByCountId).toBe(countId);
    const [balance] = await db
      .select({ quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(eq(stockBalances.productId, product.id));
    expect(balance?.quantity).toBe(5_000);
  });
});

describe("the price reviews a purchase postpones", () => {
  const quantityLine = (productId: string) => ({
    loadedBy: "quantity" as const,
    productId,
    quantity: 1_000,
    costPaidCents: 500,
    lotNumber: null,
    expiresOn: null,
  });

  it("opens one postponement per purchased product on the branch's price list", async () => {
    const supplierId = await newSupplier();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina" });
    await insertProduct(db, { name: "Arroz" });
    const [otherPriceList] = await db
      .insert(priceLists)
      .values({ name: "Lista mayorista" })
      .returning({ id: priceLists.id });
    await db
      .update(branchSettings)
      .set({ priceListId: otherPriceList?.id as string })
      .where(eq(branchSettings.locationId, locationId));

    const purchase = await register(supplierId, [
      quantityLine(yerba.id),
      quantityLine(harina.id),
      quantityLine(yerba.id),
    ]);

    const postponements = await db.select().from(priceReviewPostponements);
    expect(postponements).toHaveLength(2);
    expect(postponements).toEqual(
      expect.arrayContaining(
        [yerba.id, harina.id].map((productId) =>
          expect.objectContaining({
            productId,
            priceListId: otherPriceList?.id,
            postponedAt: RECORDED_AT,
            actorId,
            purchaseId: purchase.id,
            resolvedByReviewId: null,
          }),
        ),
      ),
    );
  });
});
