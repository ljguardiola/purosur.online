import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const MISSING_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";

async function databaseHoldingABatchWithItsMovements() {
  const database = await databaseBeforeMigration("_void_assembly_batches");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const mixId = await first(
    "insert into products (name, category_id, sale_unit) values ('Mix', $1, 'KG') returning id",
    [categoryId],
  );
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const batchId = await first(
    `insert into assembly_batches (product_id, location_id, assembled_at, output_qty, actor_id)
     values ($1, $2, now(), 14000, $3) returning id`,
    [mixId, locationId, userId],
  );
  await database.query(
    `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, assembly_batch_id)
     values ($1, $2, 'assembly_in', null, 14000, now(), $3, $4)`,
    [mixId, locationId, userId, batchId],
  );
  return { database, first, mixId, locationId, userId, batchId };
}

async function migrated() {
  const { database, ...ids } = await databaseHoldingABatchWithItsMovements();
  const client = await database.applyMigration();
  return { client, ...ids };
}

describe("the void assembly batches migration applied over a database that already holds a batch", {
  timeout: 30_000,
}, () => {
  it("keeps the batch and its movement, the batch not voided", async () => {
    const { client, batchId } = await migrated();

    const batches = await client.query("select id, voided_at, voided_by from assembly_batches");
    const movements = await client.query("select kind, assembly_batch_id from stock_movements");

    expect(batches.rows).toEqual([{ id: batchId, voided_at: null, voided_by: null }]);
    expect(movements.rows).toEqual([{ kind: "assembly_in", assembly_batch_id: batchId }]);
  });

  it("records who voided a batch and when, both or neither, the person an existing user", async () => {
    const { client, batchId, userId } = await migrated();
    const voidBy = (voidedAt: string | null, voidedBy: string | null) =>
      client.query("update assembly_batches set voided_at = $1, voided_by = $2 where id = $3", [
        voidedAt,
        voidedBy,
        batchId,
      ]);

    await expect(voidBy("2026-10-20T10:00:00Z", null)).rejects.toThrow(
      /assembly_batches_voided_check/,
    );
    await expect(voidBy(null, userId)).rejects.toThrow(/assembly_batches_voided_check/);
    await expect(voidBy("2026-10-20T10:00:00Z", MISSING_ID)).rejects.toThrow(
      /assembly_batches_voided_by_users_id_fk/,
    );
    await voidBy("2026-10-20T10:00:00Z", userId);

    const { rows } = await client.query("select voided_by from assembly_batches");
    expect(rows).toEqual([{ voided_by: userId }]);
  });

  it("accepts the movement that undoes a batch only against one, with no reason", async () => {
    const { client, batchId, mixId, locationId, userId } = await migrated();
    const record = (reason: string | null, linkedTo: string | null) =>
      client.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, assembly_batch_id)
         values ($1, $2, 'assembly_void', $3, -14000, now(), $4, $5)`,
        [mixId, locationId, reason, userId, linkedTo],
      );

    await record(null, batchId);

    await expect(record("found", batchId)).rejects.toThrow(
      /stock_movements_reason_unless_count_sale_or_receipt_check/,
    );
    await expect(record(null, null)).rejects.toThrow(
      /stock_movements_assembly_batch_iff_assembly_check/,
    );
  });
});
