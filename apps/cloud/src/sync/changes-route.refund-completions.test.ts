import { markRefundDone } from "@purosur/domain/payments/use-cases";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleRefundStore } from "../payments/drizzle-refund-store.js";
import { locations, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCancelledSale } from "../sales/test-support/applied-sales.js";
import { signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildChangesRouteApp, pulledPage } from "./test-support/changes-route.js";
import { lastLoggedChangeSeq } from "./test-support/logged-changes.js";
import { aTransferCancelledSale } from "./test-support/synced-facts.js";

const NOW = new Date("2026-10-09T16:00:00.000Z");
const DONE_AT = new Date("2026-10-10T16:45:00.000Z");

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
  app = buildChangesRouteApp(db, { now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function aRefundPendingAt(deviceId: string) {
  const cancelled = await applyCancelledSale(db, {
    deviceId,
    cancelledAt: NOW,
    total: 2_000,
    overrides: aTransferCancelledSale(),
  });
  const [refund] = cancelled.refunds;
  if (!refund) {
    throw new Error("test setup: the cancelled sale has no refund");
  }
  return refund.id;
}

describe("GET /changes carrying refund completions", () => {
  it("tells a register of the refund's branch who marked it done and when", async () => {
    const { deviceId, deviceToken, locationId } = await insertEnrolledInstallation(db, {
      now: NOW,
    });
    const refundId = await aRefundPendingAt(deviceId);
    const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const since = await lastLoggedChangeSeq(db);

    await markRefundDone(
      { store: new DrizzleRefundStore(db), clock: { now: () => DONE_AT } },
      { refundId, locationId, actorId: userId },
    );

    const page = await pulledPage(app, since, deviceToken);
    expect(page.changes.map(({ change_seq, ...change }) => change)).toEqual([
      {
        entity: "refund_completion",
        entity_id: refundId,
        row: { done_by: userId, done_at: DONE_AT.toISOString() },
      },
    ]);
  });

  it("tells a register of another branch nothing about it", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const refundId = await aRefundPendingAt(deviceId);
    const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocation?.id as string, name: "Caja 9" })
      .returning({ id: registers.id });
    const { deviceToken: otherBranchToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: otherRegister?.id as string,
    });
    const since = await lastLoggedChangeSeq(db);

    await markRefundDone(
      { store: new DrizzleRefundStore(db), clock: { now: () => DONE_AT } },
      { refundId, locationId, actorId: userId },
    );

    const page = await pulledPage(app, since, otherBranchToken);
    expect(page.changes).toEqual([]);
  });
});
