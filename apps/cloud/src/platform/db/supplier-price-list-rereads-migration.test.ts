import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

interface Seed {
  supplierId: string;
  locationId: string;
  userId: string;
}

async function databaseHoldingAListUnderReview() {
  const database = await databaseBeforeMigration("_rereads_of_supplier_price_lists");
  const { rows: users } = await database.query<{ id: string; location_id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id, location_id`,
  );
  const userId = users[0]?.id as string;
  const locationId = users[0]?.location_id as string;
  const { rows: suppliers } = await database.query<{ id: string }>(
    `insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id`,
    [userId],
  );
  const seed: Seed = { supplierId: suppliers[0]?.id as string, locationId, userId };
  const { rows: lists } = await database.query<{ id: string }>(
    `insert into supplier_price_lists
       (supplier_id, location_id, source_kind, source_url, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by, sent_at, sent_on)
     values ($1, $2, 'WEB_PAGE', 'https://distribuidora-sur.example/catalogo', 'STORE_CATALOG', 1000, 'EXTRACTED', '2026-03-01T12:00:00Z', $3, '2026-03-01T12:01:00Z', '2026-03-01')
     returning id`,
    [seed.supplierId, seed.locationId, seed.userId],
  );
  const listId = lists[0]?.id as string;
  await database.query(
    `insert into supplier_price_list_rows (list_id, position, description, supplier_code, price_cents, reviewed)
     values ($1, 0, 'Yerba mate 1 kg', 'YM1', 450000, true), ($1, 1, 'Azúcar 1 kg', null, 120000, false)`,
    [listId],
  );
  return { database, seed, listId };
}

function startReread(database: SqlOnlyDatabase, seed: Seed, listId: string) {
  return database.query(
    `insert into supplier_price_list_rereads
       (list_id, location_id, state, file_content_kind, file_byte_size, requested_at, requested_by)
     values ($1, $2, 'READING', 'STORE_CATALOG', 1000, '2026-03-02T09:00:00Z', $3)`,
    [listId, seed.locationId, seed.userId],
  );
}

describe("the rereads of supplier price lists migration applied over a database that already holds a list under review", {
  timeout: 30_000,
}, () => {
  it("leaves the list with its rows, no reread in progress and no removed item", async () => {
    const { database, listId } = await databaseHoldingAListUnderReview();

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ description: string; reviewed: boolean }>(
      `select description, reviewed from supplier_price_list_rows where list_id = $1 order by position`,
      [listId],
    );
    expect(rows).toEqual([
      { description: "Yerba mate 1 kg", reviewed: true },
      { description: "Azúcar 1 kg", reviewed: false },
    ]);
    const { rows: rereads } = await migrated.query(
      `select id from supplier_price_list_rereads where list_id = $1`,
      [listId],
    );
    expect(rereads).toEqual([]);
    const { rows: removed } = await migrated.query(
      `select id from supplier_price_list_removed_items where list_id = $1`,
      [listId],
    );
    expect(removed).toEqual([]);
  });

  it("lets the list be read again once, and only once at a time", async () => {
    const { database, seed, listId } = await databaseHoldingAListUnderReview();
    const migrated = await database.applyMigration();

    await startReread(migrated, seed, listId);

    await expect(startReread(migrated, seed, listId)).rejects.toThrow();
  });

  it("lets the list remember an item removed from it", async () => {
    const { database, listId } = await databaseHoldingAListUnderReview();
    const migrated = await database.applyMigration();

    await migrated.query(
      `insert into supplier_price_list_removed_items (list_id, key_kind, key_value, price_cents)
       values ($1, 'code', 'YM1', 450000)`,
      [listId],
    );

    const { rows } = await migrated.query<{ key_value: string }>(
      `select key_value from supplier_price_list_removed_items where list_id = $1`,
      [listId],
    );
    expect(rows).toEqual([{ key_value: "YM1" }]);
  });
});
