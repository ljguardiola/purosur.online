import { markRefundDone } from "@purosur/domain/sales/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentRefunds, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { aTransferCancelledSale } from "../sync/test-support/synced-facts.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRefundStore } from "./drizzle-refund-store.js";
import { applyCancelledSale } from "./test-support/applied-sales.js";

// PGlite serves every query on one connection, so this race needs a real Postgres.
const NOON = new Date("2026-01-05T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("refund_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("marking a pending refund as done from two requests at once", () => {
  it("marks it once and tells the other request it was already done", async () => {
    const locationId = await seededLocationId(db);
    const { deviceId } = await insertEnrolledInstallation(db, { now: NOON });
    const cancelled = await applyCancelledSale(db, {
      deviceId,
      cancelledAt: NOON,
      total: 2_000,
      overrides: aTransferCancelledSale(),
    });
    const [refund] = cancelled.refunds;
    if (!refund) {
      throw new Error("test setup: the cancelled sale has no refund");
    }
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada", email: "ada@example.com", locationId })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("test setup: inserting the user returned no row");
    }
    const ports = { store: new DrizzleRefundStore(db), clock: { now: () => NOON } };
    const input = { refundId: refund.id, locationId, actorId: actor.id };

    const outcomes = await Promise.all([
      markRefundDone(ports, input),
      markRefundDone(ports, input),
    ]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["already_done", "marked_done"]);
    expect(await db.select().from(paymentRefunds)).toHaveLength(1);
  });
});
