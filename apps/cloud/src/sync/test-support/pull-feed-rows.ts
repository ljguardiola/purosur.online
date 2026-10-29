import { STOCK_MOVEMENT_KINDS, type StockMovementKind } from "@purosur/domain";
import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { recordAuthorizedCuit } from "@purosur/domain/fiscal/use-cases";
import {
  assignPointTerminal,
  assignQrPointOfSale,
  markRefundDone,
} from "@purosur/domain/payments/use-cases";
import { createDiscount, setPrice } from "@purosur/domain/pricing/use-cases";
import { sql } from "drizzle-orm";
import { DrizzleIssuerIdentificationStore } from "../../fiscal/drizzle-issuer-identification-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "../../fiscal/drizzle-offline-authorization-code-store.js";
import { configureOfflinePointOfSale } from "../../fiscal/test-support/offline-point-of-sale-fixtures.js";
import { DrizzlePointTerminalAssignmentStore } from "../../payments/drizzle-point-terminal-assignment-store.js";
import { DrizzleQrPointOfSaleAssignmentStore } from "../../payments/drizzle-qr-point-of-sale-assignment-store.js";
import { DrizzleRefundStore } from "../../payments/drizzle-refund-store.js";
import {
  branchFirstCashSessions,
  brands,
  buyerTaxStatusSets,
  categories,
  products,
  stockMovements,
  tags,
  users,
  zoneRules,
} from "../../platform/db/schema.js";
import { DrizzleDiscountStore } from "../../pricing/drizzle-discount-store.js";
import { DrizzlePricingStore } from "../../pricing/drizzle-pricing-store.js";
import {
  type EnrolledInstallation,
  insertEnrolledInstallation,
} from "../../register/test-support/enrolled-installation.js";
import { applyCancelledSale } from "../../sales/test-support/applied-sales.js";
import { signedInWith } from "../../stock/test-support/stock-route-fixtures.js";
import type { TestDatabase } from "../../test-support/build-test-database.js";
import { logChange } from "../change-log.js";
import { aTransferCancelledSale } from "./synced-facts.js";

const KINDS_OF_SALE_LINES = ["sale", "sale_void", "return"];
const KINDS_OF_ASSEMBLY_BATCHES = ["assembly_out", "assembly_in", "assembly_void"];
const KINDS_WITH_A_REASON = ["loss", "adjustment"];

export async function insertLoggedBrand(db: TestDatabase["db"], name: string): Promise<string> {
  const [brand] = await db.insert(brands).values({ name }).returning({ id: brands.id });
  const brandId = brand?.id as string;
  await logChange(db, { entity: "brand", entityId: brandId, version: 1, op: "insert" });
  return brandId;
}

export async function insertStockMovementOwners(
  db: TestDatabase["db"],
  locationId: string,
): Promise<{ categoryId: string; productId: string; actorId: string }> {
  const [category] = await db
    .insert(categories)
    .values({ name: "Almacen" })
    .returning({ id: categories.id });
  const [product] = await db
    .insert(products)
    .values({ name: "Yerba", categoryId: category?.id as string, saleUnit: "UNIT" })
    .returning({ id: products.id });
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  return {
    categoryId: category?.id as string,
    productId: product?.id as string,
    actorId: actor?.id as string,
  };
}

export async function insertLoggedStockMovement(
  testDatabase: TestDatabase,
  movement: { kind: StockMovementKind; locationId: string; productId: string; actorId: string },
): Promise<string> {
  const { db } = testDatabase;
  const movementId = await testDatabase.asMigrator(async () => {
    const [inserted] = await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      return tx
        .insert(stockMovements)
        .values({
          productId: movement.productId,
          locationId: movement.locationId,
          kind: movement.kind,
          reason: KINDS_WITH_A_REASON.includes(movement.kind) ? "spoiled" : null,
          saleLineId: KINDS_OF_SALE_LINES.includes(movement.kind) ? crypto.randomUUID() : null,
          purchaseLineId: movement.kind === "receipt" ? crypto.randomUUID() : null,
          assemblyBatchId: KINDS_OF_ASSEMBLY_BATCHES.includes(movement.kind)
            ? crypto.randomUUID()
            : null,
          delta: 1000,
          occurredAt: new Date("2026-10-09T15:00:00.000Z"),
          actorId: movement.actorId,
        })
        .returning({ id: stockMovements.id });
    });
    return inserted?.id as string;
  });
  await logChange(db, {
    entity: "stock_movement",
    entityId: movementId,
    version: 1,
    op: "insert",
    locationId: movement.locationId,
  });
  return movementId;
}

async function insertLoggedZoneRules(db: TestDatabase["db"]): Promise<string> {
  const [rules] = await db
    .insert(zoneRules)
    .values({
      version: "2026a",
      transitions: [{ from: "1900-01-01T00:00:00.000Z", offsetMinutes: -180 }],
      publicationNumber: 9_999,
    })
    .returning({ id: zoneRules.id });
  const zoneRulesId = rules?.id as string;
  await logChange(db, { entity: "zone_rules", entityId: zoneRulesId, version: 1, op: "insert" });
  return zoneRulesId;
}

function expectOutcome<TOutcome extends { kind: string }>(
  outcome: TOutcome,
  kind: TOutcome["kind"],
): TOutcome {
  if (outcome.kind !== kind) {
    throw new Error(`test setup: expected ${kind}, got ${outcome.kind}`);
  }
  return outcome;
}

async function insertLoggedTag(db: TestDatabase["db"]): Promise<string> {
  const [tag] = await db.insert(tags).values({ name: "Organico" }).returning({ id: tags.id });
  const tagId = tag?.id as string;
  await logChange(db, { entity: "tag", entityId: tagId, version: 1, op: "insert" });
  return tagId;
}

async function logRemovedCategory(db: TestDatabase["db"]): Promise<void> {
  const categoryId = crypto.randomUUID();
  await logChange(db, { entity: "category", entityId: categoryId, version: 1, op: "insert" });
  await logChange(db, { entity: "category", entityId: categoryId, version: 2, op: "delete" });
}

async function insertLoggedBuyerTaxStatusSet(db: TestDatabase["db"]): Promise<void> {
  const [set] = await db
    .insert(buyerTaxStatusSets)
    .values({
      paramsVersion: 1,
      options: [{ code: 901, description: "Condicion de prueba A", invoiceClass: "A" }],
    })
    .returning({ id: buyerTaxStatusSets.id });
  await logChange(db, {
    entity: "buyer_tax_status_set",
    entityId: set?.id as string,
    version: 1,
    op: "insert",
  });
}

async function completeARefund(
  db: TestDatabase["db"],
  { deviceId, locationId }: EnrolledInstallation,
  now: Date,
  confirmedBy: string,
): Promise<void> {
  const cancelled = await applyCancelledSale(db, {
    deviceId,
    cancelledAt: now,
    total: 2_000,
    overrides: aTransferCancelledSale(),
  });
  const [refund] = cancelled.refunds;
  if (!refund) {
    throw new Error("test setup: the cancelled sale has no refund");
  }
  expectOutcome(
    await markRefundDone(
      { store: new DrizzleRefundStore(db), clock: { now: () => now } },
      { refundId: refund.id, locationId, actorId: confirmedBy },
    ),
    "marked_done",
  );
}

export async function insertInstallationWithAChangeOfEveryPulledEntity(
  testDatabase: TestDatabase,
  now: Date,
): Promise<EnrolledInstallation> {
  const { db } = testDatabase;
  const registerId = await configureOfflinePointOfSale(db, {
    registerName: "Caja 1",
    realTimePointOfSale: 7,
    offlinePointOfSale: 8,
    now,
  });
  const installation = await insertEnrolledInstallation(db, {
    now,
    existingRegisterId: registerId,
  });
  const { locationId } = installation;
  await logChange(db, { entity: "register", entityId: registerId, version: 1, op: "insert" });
  await db.insert(branchFirstCashSessions).values({ locationId, openedAt: now });
  await logChange(db, {
    entity: "branch_first_cash_session",
    entityId: locationId,
    version: 1,
    op: "insert",
  });

  const { categoryId, productId, actorId } = await insertStockMovementOwners(db, locationId);
  await logChange(db, { entity: "category", entityId: categoryId, version: 1, op: "insert" });
  await logChange(db, { entity: "product", entityId: productId, version: 1, op: "insert" });
  const { userId } = await signedInWith(db, ["confirm_refunds"], now);
  await logChange(db, { entity: "user", entityId: userId, version: 1, op: "insert", locationId });
  await logRemovedCategory(db);
  await insertLoggedBrand(db, "Granuz");
  const tagId = await insertLoggedTag(db);
  await insertLoggedZoneRules(db);
  await insertLoggedBuyerTaxStatusSet(db);

  expectOutcome(
    await setPrice(
      { store: new DrizzlePricingStore(db, () => now), clock: { now: () => now } },
      { productId, locationId, unitPrice: 1000, expectedCurrentPriceId: null, actorId },
    ),
    "applied",
  );
  expectOutcome(
    await createDiscount(
      { store: new DrizzleDiscountStore(db) },
      {
        name: "Martes de infusiones",
        benefit: { kind: "PERCENT_OFF", percent: 10 },
        target: { kind: "TAG", id: tagId },
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [2],
      },
    ),
    "created",
  );
  expectOutcome(
    await recordAuthorizedCuit(
      { store: new DrizzleIssuerIdentificationStore(db, () => now) },
      { authorizedCuit: FICTIONAL_CUIT },
    ),
    "recorded",
  );
  expectOutcome(
    await assignPointTerminal(new DrizzlePointTerminalAssignmentStore(db, () => now), {
      locationId,
      registerId,
      terminalId: "PAX_A910__SMARTPOS1",
      version: 0,
      actorId,
    }),
    "assigned",
  );
  expectOutcome(
    await assignQrPointOfSale(new DrizzleQrPointOfSaleAssignmentStore(db, () => now), {
      locationId,
      registerId,
      externalPosId: "CAJA1_STORE_POS",
      version: 0,
      actorId,
    }),
    "assigned",
  );
  const fortnight = { start: "2026-10-01", end: "2026-10-15" };
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code: "36123456789012", fortnight, reportDeadline: "2026-10-27" },
      obtainedAt: now,
      obtainedThrough: "requested",
    }),
  );
  await completeARefund(db, installation, now, userId);

  for (const kind of STOCK_MOVEMENT_KINDS) {
    await insertLoggedStockMovement(testDatabase, { kind, locationId, productId, actorId });
  }
  return installation;
}
