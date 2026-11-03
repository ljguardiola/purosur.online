import {
  addPurchaseLines,
  correctPurchaseHeader,
  createSupplier,
  registerPurchase,
} from "@purosur/domain/purchasing/use-cases";
import { asc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lots, purchaseLines } from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const clock = { now: () => NOW };

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("purchase_correction_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const line = (productId: string) => ({
  loadedBy: "quantity" as const,
  productId,
  quantity: 1_000,
  costPaidCents: 500,
  lotNumber: null,
  expiresOn: null,
});

async function registeredPurchase() {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  const yerba = await insertProduct(db, { name: "Yerba" });
  const harina = await insertProduct(db, { name: "Harina" });
  const supplier = await createSupplier(new DrizzlePurchasingStore(db, clock.now), {
    name: `Distribuidora Sur ${crypto.randomUUID()}`,
    cuit: null,
    contact: null,
    note: null,
    actorId,
  });
  if (supplier.kind !== "created") {
    throw new Error(`test setup: creating the supplier ended as ${supplier.kind}`);
  }
  const registered = await registerPurchase(
    { zoneRules: fixedZoneRulesSource(), store: new DrizzlePurchasingStore(db, clock.now), clock },
    {
      supplierId: supplier.supplier.id,
      purchasedOn: "2026-10-14",
      receiptType: "sin_comprobante",
      receiptNumber: null,
      note: null,
      lines: [line(yerba.id)],
      actorId,
      locationId,
    },
  );
  if (registered.kind !== "registered") {
    throw new Error(`test setup: registering the purchase ended as ${registered.kind}`);
  }
  return { actorId, locationId, purchaseId: registered.purchase.id, harinaId: harina.id };
}

function holdPurchaseLock(purchaseId: string) {
  return (holder: postgres.ReservedSql) =>
    holder`select id from purchases where id = ${purchaseId} for update`;
}

describe("corrections of one purchase queued behind each other, on a real Postgres", () => {
  it("gives two concurrent additions distinct positions", async () => {
    const ids = await registeredPurchase();
    const add = () =>
      addPurchaseLines(
        { store: new DrizzlePurchasingStore(db, clock.now), clock },
        {
          purchaseId: ids.purchaseId,
          locationId: ids.locationId,
          actorId: ids.actorId,
          lines: [line(ids.harinaId)],
        },
      );

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      holdPurchaseLock(ids.purchaseId),
      add,
      add,
    );

    expect([first.kind, second.kind]).toEqual(["added", "added"]);
    const positions = await db
      .select({ position: purchaseLines.position })
      .from(purchaseLines)
      .where(eq(purchaseLines.purchaseId, ids.purchaseId))
      .orderBy(asc(purchaseLines.position));
    expect(positions.map(({ position }) => position)).toEqual([1, 2, 3]);
  });

  it("dates a line added behind a header correction by the corrected date", async () => {
    const ids = await registeredPurchase();

    const [corrected, added] = await runQueuedBehindHeldLock(
      sql,
      holdPurchaseLock(ids.purchaseId),
      () =>
        correctPurchaseHeader(
          {
            store: new DrizzlePurchasingStore(db, clock.now),
            clock,
            zoneRules: fixedZoneRulesSource(),
          },
          {
            purchaseId: ids.purchaseId,
            locationId: ids.locationId,
            actorId: ids.actorId,
            purchasedOn: "2026-10-13",
            receiptType: "sin_comprobante",
            receiptNumber: null,
            note: null,
          },
        ),
      () =>
        addPurchaseLines(
          { store: new DrizzlePurchasingStore(db, clock.now), clock },
          {
            purchaseId: ids.purchaseId,
            locationId: ids.locationId,
            actorId: ids.actorId,
            lines: [line(ids.harinaId)],
          },
        ),
    );

    expect([corrected.kind, added.kind]).toEqual(["corrected", "added"]);
    const dates = await db.select({ purchasedOn: lots.purchasedOn }).from(lots);
    expect(dates.map(({ purchasedOn }) => purchasedOn)).toEqual(["2026-10-13", "2026-10-13"]);
  });
});
