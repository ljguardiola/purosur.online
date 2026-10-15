import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function claimOfflinePointOfSale(client: SqlOnlyDatabase) {
  const { rows } = await client.query<{ id: string }>(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id`,
  );
  const registerId = rows[0]?.id;
  await client.query(
    `insert into users (first_name, email, location_id)
     select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
  );
  await client.query(
    `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
     select 7, $1::uuid, 'offline', id from users`,
    [registerId],
  );
  return registerId;
}

function insertBlock(
  registerId: string | undefined,
  range: { first: number; last: number },
  status: string,
) {
  return {
    text: `insert into offline_number_blocks
             (point_of_sale_number, document_type, register_id, first_number, last_number, status, assigned_at, version)
           values (7, 'factura_c', $1, $2, $3, $4, '2026-10-01T12:00:00Z', 1)`,
    values: [registerId, range.first, range.last, status],
  };
}

describe("the used up offline number blocks migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a block already in use as it was", async () => {
    const database = await databaseBeforeMigration("_offline_number_blocks_used_up");
    const registerId = await claimOfflinePointOfSale(database);
    const block = insertBlock(registerId, { first: 1, last: 1000 }, "in_use");
    await database.query(block.text, block.values);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select first_number, last_number, status from offline_number_blocks",
    );
    expect(rows).toEqual([{ first_number: 1, last_number: 1000, status: "in_use" }]);
  });

  it("lets a block be used up, beside the contiguous block that follows it", async () => {
    const database = await databaseBeforeMigration("_offline_number_blocks_used_up");
    const registerId = await claimOfflinePointOfSale(database);
    const migrated = await database.applyMigration();

    for (const block of [
      insertBlock(registerId, { first: 1, last: 1000 }, "used_up"),
      insertBlock(registerId, { first: 1001, last: 2000 }, "in_use"),
    ]) {
      await migrated.query(block.text, block.values);
    }

    const { rows } = await migrated.query(
      "select first_number, status from offline_number_blocks order by first_number",
    );
    expect(rows).toEqual([
      { first_number: 1, status: "used_up" },
      { first_number: 1001, status: "in_use" },
    ]);
  });

  it("still refuses a status it does not know", async () => {
    const database = await databaseBeforeMigration("_offline_number_blocks_used_up");
    const registerId = await claimOfflinePointOfSale(database);
    const migrated = await database.applyMigration();

    const block = insertBlock(registerId, { first: 1, last: 1000 }, "reserved");
    await expect(migrated.query(block.text, block.values)).rejects.toThrow();
  });
});
