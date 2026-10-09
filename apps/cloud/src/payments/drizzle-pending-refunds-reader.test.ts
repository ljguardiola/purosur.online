import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCancelledSale, applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { insertLocation, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { aTransferCancelledSale } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePendingRefundsReader } from "./drizzle-pending-refunds-reader.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");

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

const reader = () => new DrizzlePendingRefundsReader(db);

describe("DrizzlePendingRefundsReader.pendingRefunds", () => {
  it("lists the pending refund of a cancelled sale with its register and who cancelled it", async () => {
    const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    const { userId } = await signedInWith(db, [], NOW);
    const cancelled = aTransferCancelledSale({ actorId: userId });
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: new Date("2026-10-07T14:00:00.000Z"),
      total: 2_000,
      overrides: cancelled,
    });
    const [refund] = cancelled.refunds;

    const pending = await reader().pendingRefunds(locationId);

    expect(pending).toEqual([
      {
        id: refund?.id,
        saleId: cancelled.id,
        registerId,
        registerName: "Caja 1",
        method: "TRANSFER",
        amount: 2_000,
        occurredAt: refund?.occurredAt,
        cancelledBy: userId,
        cancelledByName: "Ada Lucero",
      },
    ]);
  });

  it("names nobody when the sale was cancelled by someone the cloud does not know", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: NOW,
      total: 2_000,
      overrides: aTransferCancelledSale({ actorId: "not-a-known-user" }),
    });

    const [refund] = await reader().pendingRefunds(locationId);

    expect(refund).toMatchObject({ cancelledBy: "not-a-known-user", cancelledByName: null });
  });

  it("lists the oldest refund first", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const apply = (cancelledAt: string) =>
      applyCancelledSale(db, {
        deviceId,
        cancelledAt: new Date(cancelledAt),
        total: 2_000,
        overrides: aTransferCancelledSale({ cancelledAt: new Date(cancelledAt) }),
      });
    const later = await apply("2026-10-07T14:00:00.000Z");
    const earlier = await apply("2026-10-06T14:00:00.000Z");

    const pending = await reader().pendingRefunds(locationId);

    expect(pending.map((refund) => refund.saleId)).toEqual([earlier.id, later.id]);
  });

  it("leaves out the refunds a person already marked as done and the ones nobody has to carry out", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    await applyCancelledSale(db, { deviceId, cancelledAt: NOW, total: 1_000 });
    await applyCompletedSale(db, { deviceId, completedAt: NOW, total: 1_000 });

    expect(await reader().pendingRefunds(locationId)).toEqual([]);
  });

  it("never lists the pending refunds of another branch", async () => {
    const own = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const otherLocationId = await insertLocation(db);
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocationId, name: "Caja 1" })
      .returning({ id: registers.id });
    const other = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: otherRegister?.id ?? randomUUID(),
    });
    await applyCancelledSale(db, {
      deviceId: other.deviceId,
      cancelledAt: NOW,
      total: 2_000,
      overrides: aTransferCancelledSale(),
    });

    expect(await reader().pendingRefunds(own.locationId)).toEqual([]);
    expect(await reader().pendingRefunds(otherLocationId)).toHaveLength(1);
  });
});
