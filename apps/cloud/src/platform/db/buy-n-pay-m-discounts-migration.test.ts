import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import { discounts } from "./schema.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

async function buyNPayMEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_buy_n_pay_m_discounts",
    "test setup: no buy-N-pay-M discounts migration in the journal",
  );
}

describe("the buy-N-pay-M migration applied to a database that already holds discounts", {
  timeout: 30_000,
}, () => {
  it("keeps every percent-off discount as it was, with no quantities", async () => {
    const folder = await mkdtemp(join(tmpdir(), "buy-n-pay-m-discounts-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await buyNPayMEntry());

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: categoryRows } = await client.query<{ id: string }>(
      "insert into categories (name) values ($1) returning id",
      ["Infusiones"],
    );
    const category = categoryRows[0];
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const { rows: discountRows } = await client.query<{ id: string }>(
      `insert into discounts (name, kind, percent, category_id, valid_from, valid_to, weekdays)
       values ($1, 'PERCENT_OFF', 10, $2, '2026-10-01', '2026-10-31', '{2}') returning id`,
      ["Martes de infusiones", category.id],
    );
    const seededDiscount = discountRows[0];
    if (!seededDiscount) {
      throw new Error("test setup: seeding the discount returned no row");
    }

    await addMigrationEntry(folder, await buyNPayMEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    expect(
      await drizzle(client)
        .select({
          id: discounts.id,
          kind: discounts.kind,
          percent: discounts.percent,
          buyQty: discounts.buyQty,
          payQty: discounts.payQty,
          categoryId: discounts.categoryId,
        })
        .from(discounts),
    ).toEqual([
      {
        id: seededDiscount.id,
        kind: "PERCENT_OFF",
        percent: 10,
        buyQty: null,
        payQty: null,
        categoryId: category.id,
      },
    ]);
  });
});
