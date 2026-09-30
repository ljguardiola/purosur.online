import { randomUUID } from "node:crypto";
import { createTag } from "@purosur/domain/catalog/use-cases";
import { createDiscount, editDiscount } from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { discounts, tags } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleDiscountStore } from "./drizzle-discount-store.js";

// PGlite serializes every query on one connection, so where a lock is taken can only be observed
// against a real Postgres pool.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("discount_change_log_order");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function insertTag(): Promise<string> {
  const outcome = await createTag(new DrizzleCatalogStore(db), {
    name: `Sin TACC ${randomUUID()}`,
  });
  if (outcome.kind !== "created") {
    throw new Error(`test setup: creating the tag ended as ${outcome.kind}`);
  }
  return outcome.tag.id;
}

function discountOn(tagId: string) {
  return {
    name: "Martes de infusiones",
    benefit: { kind: "PERCENT_OFF", percent: 10 } as const,
    target: { kind: "TAG", id: tagId } as const,
    validFrom: "2026-10-01",
    validTo: "2026-10-31",
    weekdays: [2, 4],
  };
}

async function holdingTheChangeLog<TOutcome>(
  start: () => Promise<TOutcome>,
  whileWaiting: () => Promise<unknown>,
): Promise<TOutcome> {
  const holder = await sql.reserve();
  await holder`begin`;
  await holder`select pg_advisory_xact_lock(hashtextextended('changes_log', 0))`;
  const started = start();
  let concurrent: Promise<unknown> = Promise.resolve();
  try {
    await waitForLockWaiters(sql, 1);
    concurrent = whileWaiting();
    await waitForLockWaiters(sql, 2);
  } finally {
    await holder`rollback`;
    holder.release();
  }
  await concurrent;
  return started;
}

describe("writing a discount while another writer holds the change log, on a real Postgres", () => {
  it("still holds the target's lock when a creation starts waiting for the log", async () => {
    const tagId = await insertTag();

    const outcome = await holdingTheChangeLog(
      () => createDiscount({ store: new DrizzleDiscountStore(db) }, discountOn(tagId)),
      () => sql`update tags set active = false where id = ${tagId}`.then(() => undefined),
    );

    expect(outcome).toMatchObject({ kind: "created" });
    const [tag] = await db.select({ active: tags.active }).from(tags).where(eq(tags.id, tagId));
    expect(tag).toEqual({ active: false });
    expect(await db.select().from(discounts).where(eq(discounts.tagId, tagId))).toHaveLength(1);
  });

  it("has already written the edited discount's row when an edit starts waiting for the log", async () => {
    const tagId = await insertTag();
    const created = await createDiscount(
      { store: new DrizzleDiscountStore(db) },
      discountOn(tagId),
    );
    if (created.kind !== "created") {
      throw new Error(`test setup: creating the discount ended as ${created.kind}`);
    }

    const outcome = await holdingTheChangeLog(
      () =>
        editDiscount(
          { store: new DrizzleDiscountStore(db), clock: { now: () => new Date() } },
          { ...discountOn(tagId), id: created.id, version: 1, active: false },
        ),
      () => sql`update discounts set name = 'Otra' where id = ${created.id}`.then(() => undefined),
    );

    expect(outcome).toEqual({ kind: "applied", version: 2 });
    const [row] = await db.select().from(discounts).where(eq(discounts.id, created.id));
    expect(row).toMatchObject({ name: "Otra", active: false, version: 2 });
  });
});
