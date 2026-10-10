import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

async function postponementsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_price_review_postponements",
    "test setup: no price review postponements migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "price-review-postponements-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await postponementsEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await client.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const priceListId = await first("select id from price_lists limit 1");
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const productId = await first(
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  return { client, folder, first, locationId, priceListId, productId, userId };
}

describe("the price review postponements migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded price review and starts with no postponement", async () => {
    const { client, folder, first, priceListId, productId, userId } = await databaseBefore();
    const priceId = await first(
      "insert into prices (product_id, price_list_id, unit_price) values ($1, $2, 500) returning id",
      [productId, priceListId],
    );
    await client.query(
      "insert into price_reviews (product_id, price_list_id, actor_id, price_id) values ($1, $2, $3, $4)",
      [productId, priceListId, userId, priceId],
    );

    await addMigrationEntry(folder, await postponementsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const reviews = await client.query("select product_id, price_id from price_reviews");
    expect(reviews.rows).toEqual([{ product_id: productId, price_id: priceId }]);
    const postponements = await client.query("select id from price_review_postponements");
    expect(postponements.rows).toEqual([]);
  });

  it("opens a postponement for a purchase of a product, resolvable by a later review", async () => {
    const { client, folder, first, locationId, priceListId, productId, userId } =
      await databaseBefore();
    const supplierId = await first(
      "insert into suppliers (name, actor_id) values ('Distribuidora Sur', $1) returning id",
      [userId],
    );
    await addMigrationEntry(folder, await postponementsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
    const purchaseId = await first(
      `insert into purchases (supplier_id, location_id, purchased_on, receipt_type, recorded_at, actor_id)
       values ($1, $2, '2026-10-01', 'sin_comprobante', now(), $3) returning id`,
      [supplierId, locationId, userId],
    );
    const priceId = await first(
      "insert into prices (product_id, price_list_id, unit_price) values ($1, $2, 500) returning id",
      [productId, priceListId],
    );
    const reviewId = await first(
      "insert into price_reviews (product_id, price_list_id, actor_id, price_id) values ($1, $2, $3, $4) returning id",
      [productId, priceListId, userId, priceId],
    );

    const postponementId = await first(
      `insert into price_review_postponements (product_id, price_list_id, postponed_at, actor_id, purchase_id)
       values ($1, $2, now(), $3, $4) returning id`,
      [productId, priceListId, userId, purchaseId],
    );
    await client.query(
      "update price_review_postponements set resolved_by_review_id = $1 where id = $2",
      [reviewId, postponementId],
    );

    const { rows } = await client.query(
      "select purchase_id, resolved_by_review_id from price_review_postponements",
    );
    expect(rows).toEqual([{ purchase_id: purchaseId, resolved_by_review_id: reviewId }]);
  });
});
