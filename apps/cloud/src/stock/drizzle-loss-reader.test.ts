import { randomUUID } from "node:crypto";
import type { ReturnResolution } from "@purosur/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyReturn } from "../returns/test-support/applied-returns.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { aCompletedSale, type CompletedSale } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleLossReader } from "./drizzle-loss-reader.js";
import {
  insertLocation,
  insertMovement,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };

async function seededActor(): Promise<{ actorId: string; locationId: string }> {
  const { userId, locationId } = await signedInWith(db, [], new Date("2026-10-01T12:00:00.000Z"));
  return { actorId: userId, locationId };
}

async function soldLineOf(productId: string, soldAt: Date): Promise<string> {
  const { deviceId } = await insertEnrolledInstallation(db, { now: soldAt });
  const [line] = aCompletedSale().lines;
  const sold = { ...(line as NonNullable<typeof line>), id: randomUUID(), productId };
  await applyCompletedSale(db, {
    deviceId,
    completedAt: soldAt,
    total: sold.lineTotal,
    overrides: { lines: [sold] },
  });
  return sold.id;
}

describe("DrizzleLossReader.lossesRecorded", () => {
  it("answers each loss of the branch with its reason, its product and the quantity lost as a positive amount", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db, {
      name: "Almendras peladas",
      saleUnit: "KG",
      brandName: "Vitora",
      netContent: { quantity: 250, unit: "G" },
    });
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "loss",
      reason: "spoiled",
      delta: -1_500,
      occurredAt: new Date("2026-10-05T15:00:00.000Z"),
    });

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses).toEqual([
      {
        reason: "spoiled",
        product: {
          id: productId,
          name: "Almendras peladas",
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          saleUnit: "KG",
        },
        quantity: 1_500,
      },
    ]);
  });

  it("answers the losses the system assigns beside the ones recorded by hand", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const at = new Date("2026-10-05T15:00:00.000Z");
    const discardedLineId = await soldLineOf(productId, at);
    for (const reason of ["theft", "return_discard", "expired"]) {
      await insertMovement(db, {
        productId,
        locationId,
        actorId,
        kind: "loss",
        reason,
        ...(reason === "return_discard" ? { saleLineId: discardedLineId } : {}),
        delta: -1_000,
        occurredAt: at,
      });
    }

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses.map(({ reason }) => reason).sort()).toEqual([
      "expired",
      "return_discard",
      "theft",
    ]);
  });

  it("leaves out the movements that are not losses", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const occurredAt = new Date("2026-10-05T15:00:00.000Z");
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "adjustment",
      reason: "supplier_return",
      delta: -1_000,
      occurredAt,
    });
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: -1_000,
      occurredAt,
      count: { counted: 0, expected: 1 },
    });

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses).toEqual([]);
  });

  it("answers only the losses of the branch asked", async () => {
    const { actorId, locationId } = await seededActor();
    const elsewhere = await insertLocation(db);
    const { productId } = await insertProduct(db);
    const occurredAt = new Date("2026-10-05T15:00:00.000Z");
    for (const place of [locationId, elsewhere]) {
      await insertMovement(db, {
        productId,
        locationId: place,
        actorId,
        kind: "loss",
        reason: "spoiled",
        delta: place === locationId ? -1_000 : -9_000,
        occurredAt,
      });
    }

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses.map(({ quantity }) => quantity)).toEqual([1_000]);
  });

  it("answers the losses from the first to the last Argentine day of the range and no others", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const lossAt = (occurredAt: string, delta: number) =>
      insertMovement(db, {
        productId,
        locationId,
        actorId,
        kind: "loss",
        reason: "spoiled",
        delta,
        occurredAt: new Date(occurredAt),
      });
    await lossAt("2026-10-05T02:59:59.000Z", -1_000);
    await lossAt("2026-10-05T03:00:00.000Z", -2_000);
    await lossAt("2026-10-06T02:59:59.000Z", -3_000);
    await lossAt("2026-10-06T03:00:00.000Z", -4_000);

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-05" },
    });

    expect(losses.map(({ quantity }) => quantity).sort()).toEqual([2_000, 3_000]);
  });

  it("answers a loss a later count superseded, since the stock was still lost", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const occurredAt = new Date("2026-10-05T15:00:00.000Z");
    const countId = await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt,
      count: { counted: 1, expected: 1 },
    });
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "loss",
      reason: "spoiled",
      delta: -1_000,
      occurredAt,
      supersededByCountId: countId,
    });

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses.map(({ quantity }) => quantity)).toEqual([1_000]);
  });

  describe("the units of a customer's return that are discarded", () => {
    const returnedAt = new Date("2026-10-05T15:00:00.000Z");

    async function returnOf(
      { deviceId, cashierId }: { deviceId: string; cashierId: string },
      productId: string,
      options: {
        resolution: ReturnResolution;
        disposition: "restock" | "discard";
        sale?: CompletedSale;
      },
    ): Promise<CompletedSale> {
      const [line] = aCompletedSale().lines;
      const sold = options.sale
        ? undefined
        : { ...(line as NonNullable<typeof line>), id: randomUUID(), productId, quantity: 4 };
      const saleLineId = (options.sale?.lines[0] ?? sold)?.id as string;
      const movement = (
        kind: "return" | "loss" | "exchange_out",
        delta: number,
        reason: "return_discard" | null = null,
      ) => ({ id: randomUUID(), saleLineId, productId, kind, reason, delta });
      const exchanged = options.resolution === "exchange";
      const { completed } = await applyReturn(db, {
        deviceId,
        soldAt: new Date("2026-10-01T15:00:00.000Z"),
        returnedAt,
        applyStock: true,
        ...(options.sale
          ? { alreadySold: options.sale }
          : { sale: { actorId: cashierId, lines: [sold as never] } }),
        saleReturn: {
          actorId: cashierId,
          lines: [
            {
              saleLineId,
              productId,
              quantity: 1,
              reason: exchanged ? "defective" : "change_of_mind",
              resolution: options.resolution,
              disposition: options.disposition,
              refundedAmount: exchanged ? 0 : 2_400,
            },
          ],
          ...(exchanged ? { refunds: [], cashMovements: [] } : {}),
          stockMovements: [
            movement("return", 1_000),
            ...(options.disposition === "discard"
              ? [movement("loss", -1_000, "return_discard")]
              : []),
            ...(exchanged ? [movement("exchange_out", -1_000)] : []),
          ],
        },
      });
      return completed;
    }

    async function lossesOfBranch(locationId: string) {
      const losses = await new DrizzleLossReader(db).lossesRecorded({
        locationId,
        range: wholeOctober,
      });
      return losses.map(({ reason, quantity }) => ({ reason, quantity }));
    }

    async function register() {
      const { locationId } = await seededActor();
      const cashierId = randomUUID();
      await db
        .insert(users)
        .values({ id: cashierId, firstName: "Ana", email: "ana@example.com", locationId });
      const { deviceId } = await insertEnrolledInstallation(db, {
        now: new Date("2026-10-01T12:00:00.000Z"),
      });
      return { deviceId, cashierId, locationId };
    }

    it("answers the discarded unit of an exchange under its own reason, with its quantity, and not as a discarded return", async () => {
      const cashier = await register();
      const { productId } = await insertProduct(db);
      await returnOf(cashier, productId, { resolution: "exchange", disposition: "discard" });

      expect(await lossesOfBranch(cashier.locationId)).toEqual([
        { reason: "defective_exchange", quantity: 1_000 },
      ]);
    });

    it("answers no loss for an exchange whose returned unit went back to stock", async () => {
      const cashier = await register();
      const { productId } = await insertProduct(db);
      await returnOf(cashier, productId, { resolution: "exchange", disposition: "restock" });

      expect(await lossesOfBranch(cashier.locationId)).toEqual([]);
    });

    it("answers the discarded unit of a refunded return as a discarded return", async () => {
      const cashier = await register();
      const { productId } = await insertProduct(db);
      await returnOf(cashier, productId, { resolution: "refund", disposition: "discard" });

      expect(await lossesOfBranch(cashier.locationId)).toEqual([
        { reason: "return_discard", quantity: 1_000 },
      ]);
    });

    it("answers each return of the same sale line under the reason of its own resolution", async () => {
      const cashier = await register();
      const { productId } = await insertProduct(db);
      const sale = await returnOf(cashier, productId, {
        resolution: "refund",
        disposition: "discard",
      });
      await returnOf(cashier, productId, { resolution: "exchange", disposition: "discard", sale });

      expect(
        (await lossesOfBranch(cashier.locationId)).sort((a, b) => a.reason.localeCompare(b.reason)),
      ).toEqual([
        { reason: "defective_exchange", quantity: 1_000 },
        { reason: "return_discard", quantity: 1_000 },
      ]);
    });
  });

  it("refuses a stored loss whose reason is not in the catalog", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "loss",
      reason: "lost_in_move",
      delta: -1_000,
      occurredAt: new Date("2026-10-05T15:00:00.000Z"),
    });

    await expect(
      new DrizzleLossReader(db).lossesRecorded({ locationId, range: wholeOctober }),
    ).rejects.toThrow("lost_in_move");
  });
});
