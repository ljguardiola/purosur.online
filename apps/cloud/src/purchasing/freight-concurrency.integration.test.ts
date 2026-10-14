import { editFreight, type FreightValues } from "@purosur/domain/purchasing/use-cases";
import { asc } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, freights, locations } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleFreightStore } from "./drizzle-freight-store.js";
import { insertFreightRow, insertPurchaseWithLines } from "./test-support/freight-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-03-10T12:00:00.000Z");
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("freight_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two people editing the same freight at once, on a real Postgres", () => {
  it("applies one edit after the other, so the second audit record starts from what the first left", async () => {
    const [location] = await db.select({ id: locations.id }).from(locations);
    const locationId = location?.id as string;
    const recorderId = await insertActor(db);
    const firstEditorId = await insertActor(db);
    const secondEditorId = await insertActor(db);
    const product = await insertProduct(db, { name: "Yerba" });
    const purchase = await insertPurchaseWithLines(db, {
      locationId,
      actorId: recorderId,
      lines: [
        { productId: product.id, costPaidCents: 1_000, quantity: 1_000, quantityPerPackage: 1_000 },
      ],
    });
    const freightId = await insertFreightRow(db, {
      locationId,
      actorId: recorderId,
      purchaseIds: [purchase.purchaseId],
      amountCents: 10_000,
      date: "2026-03-09",
      description: "Flete",
    });
    const editTo = (amountCents: number, actorId: string) => () => {
      const values: FreightValues = {
        date: "2026-03-09",
        amountCents,
        description: "Flete",
        means: { kind: "own_trip" },
        purchaseIds: [purchase.purchaseId],
      };
      return editFreight(
        { store: new DrizzleFreightStore(db, () => NOW), clock: { now: () => NOW } },
        { ...values, freightId, locationId, actorId },
      );
    };

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      (connection) => connection`select id from freights where id = ${freightId} for update`,
      editTo(11_000, firstEditorId),
      editTo(12_000, secondEditorId),
    );

    expect([first.kind, second.kind]).toEqual(["edited", "edited"]);
    expect(await db.select().from(freights)).toMatchObject([{ amountCents: 12_000 }]);
    const audits = await db.select().from(auditLog).orderBy(asc(auditLog.id));
    expect(
      audits
        .map((audit) => ({
          actorId: audit.actorId,
          from: (audit.previousValue as FreightValues).amountCents,
          to: (audit.newValue as FreightValues).amountCents,
        }))
        .sort((left, right) => left.from - right.from),
    ).toEqual([
      { actorId: firstEditorId, from: 10_000, to: 11_000 },
      { actorId: secondEditorId, from: 11_000, to: 12_000 },
    ]);
  });
});
