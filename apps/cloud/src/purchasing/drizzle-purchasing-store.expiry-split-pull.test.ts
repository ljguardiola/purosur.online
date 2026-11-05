import { splitPurchaseLineExpiry } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purchaseLines, stockMovements } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildChangesRouteApp } from "../sync/test-support/changes-route.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { quantityLine, registeredPurchase } from "./test-support/registered-purchase.js";

const NOW = new Date("2026-10-09T16:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = buildChangesRouteApp(db, { zoneRules: fixedZoneRulesSource(), now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function purchaseSplitAfterTheRegisterLastPulled() {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  const clock = { now: () => NOW };
  const store = new DrizzlePurchasingStore(db, clock.now);
  const juice = await insertProduct(db, { name: "Jugo" });
  const purchase = await registeredPurchase({ store, clock, actorId, locationId }, [
    quantityLine(juice.id, { quantity: 5_000, expiresOn: "2026-11-10" }),
  ]);
  const [line] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
  const loggedBefore = await lastLoggedChangeSeq(db);

  const outcome = await splitPurchaseLineExpiry(
    { store, clock },
    {
      purchaseId: purchase.id,
      lineId: line?.id as string,
      locationId,
      actorId,
      quantity: 2_000,
      expiresOn: "2027-01-15",
    },
  );
  expect(outcome.kind).toBe("split");
  const [split] = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.kind, "lot_split"));
  const [receipt] = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.kind, "receipt"));
  return {
    loggedBefore,
    splitMovementId: split?.id as string,
    receiptMovementId: receipt?.id as string,
  };
}

describe("the split of a purchase line's lot and the registers", () => {
  it("logs no change for the split movement", async () => {
    const { loggedBefore } = await purchaseSplitAfterTheRegisterLastPulled();

    expect(await changesLoggedAfter(db, loggedBefore)).toEqual([]);
  });

  it.each(["0.0.1271", "1.0.1385", "1.0.9999", "2.0.0"])(
    "puts no split movement in what a register of version %s pulls, though it pulls the purchase's receipt",
    async (version) => {
      const installation = await insertEnrolledInstallation(db, { now: NOW });
      const { splitMovementId, receiptMovementId } =
        await purchaseSplitAfterTheRegisterLastPulled();

      const response = await app.inject({
        method: "GET",
        url: "/changes?since=0",
        headers: {
          authorization: `Bearer ${installation.deviceToken}`,
          "purosur-register-version": version,
        },
      });

      expect(response.statusCode).toBe(200);
      const movementIds = (
        response.json() as { changes: { entity: string; entity_id: string }[] }
      ).changes
        .filter((change) => change.entity === "stock_movement")
        .map((change) => change.entity_id);
      expect(movementIds).toEqual([receiptMovementId]);
      expect(movementIds).not.toContain(splitMovementId);
    },
  );
});
