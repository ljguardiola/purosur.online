import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freightPurchases, freights, locations } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { insertFreightRow, insertPurchaseWithLines } from "./test-support/freight-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-03-10T12:00:00.000Z");
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let locationId: string;
let actorId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("freight_constraints");
  sql = postgres(integrationDb.databaseUrl, { max: 1 });
  db = drizzle(sql);
  const [location] = await db.select({ id: locations.id }).from(locations);
  if (!location) {
    throw new Error("test setup: the migrated database holds no location");
  }
  locationId = location.id;
  actorId = await insertActor(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function constraintViolatedBy(error: unknown, name: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { constraint_name: constraintName } = current as { constraint_name?: unknown };
    if (constraintName === name) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function insertFreight(overrides: Partial<typeof freights.$inferInsert>) {
  return db.insert(freights).values({
    locationId,
    freightOn: "2026-03-09",
    amountCents: 1_000,
    description: "Flete",
    meansKind: "own_trip",
    recordedAt: NOW,
    actorId,
    updatedAt: NOW,
    ...overrides,
  });
}

describe("the freights table's constraints on a real Postgres", () => {
  it.each([
    ["an amount of zero", { amountCents: 0 }, "freights_amount_check"],
    ["an unknown means", { meansKind: "drone" }, "freights_means_kind_check"],
    [
      "a carrier without a name",
      { meansKind: "carrier", carrierName: null },
      "freights_carrier_name_iff_carrier_check",
    ],
    [
      "a name of a carrier on the store's own trip",
      { meansKind: "own_trip", carrierName: "Transportes del Sur" },
      "freights_carrier_name_iff_carrier_check",
    ],
  ] as const)("rejects %s", async (_name, overrides, constraint) => {
    await expect(insertFreight(overrides)).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, constraint),
    );
  });

  it("rejects linking a purchase to the same freight twice", async () => {
    const product = await insertProduct(db, { name: "Yerba" });
    const { purchaseId } = await insertPurchaseWithLines(db, {
      locationId,
      actorId,
      lines: [
        { productId: product.id, costPaidCents: 1_000, quantity: 1_000, quantityPerPackage: 1_000 },
      ],
    });
    const freightId = await insertFreightRow(db, {
      locationId,
      actorId,
      purchaseIds: [purchaseId],
    });

    await expect(db.insert(freightPurchases).values({ freightId, purchaseId })).rejects.toSatisfy(
      (error) => constraintViolatedBy(error, "freight_purchases_pkey"),
    );
  });
});
