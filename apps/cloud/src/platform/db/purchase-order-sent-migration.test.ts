import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function firstId(database: SqlOnlyDatabase, sql: string, values: unknown[] = []) {
  const { rows } = await database.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("test setup: seeding returned no row");
  }
  return id;
}

async function seededOrders(database: SqlOnlyDatabase) {
  const locationId = await firstId(database, "select id from locations limit 1");
  const userId = await firstId(
    database,
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const supplierId = await firstId(
    database,
    "insert into suppliers (name, actor_id) values ('Distribuidora Sur', $1) returning id",
    [userId],
  );
  const draftId = await firstId(
    database,
    `insert into purchase_orders (supplier_id, location_id, state, created_at, actor_id)
     values ($1, $2, 'DRAFT', '2026-10-20T10:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  const cancelledId = await firstId(
    database,
    `insert into purchase_orders (supplier_id, location_id, state, created_at, actor_id, cancelled_at, cancelled_by)
     values ($1, $2, 'CANCELLED', '2026-10-21T10:00:00Z', $3, '2026-10-22T10:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  return { draftId, cancelledId, userId, supplierId, locationId };
}

describe("the purchase order sent migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the draft and cancelled orders it finds, none of them sent", async () => {
    const database = await databaseBeforeMigration("_purchase_order_sent");
    const { draftId, cancelledId, userId } = await seededOrders(database);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select id, state, cancelled_at, cancelled_by, sent_at, sent_by from purchase_orders order by created_at",
    );
    expect(rows).toEqual([
      {
        id: draftId,
        state: "DRAFT",
        cancelled_at: null,
        cancelled_by: null,
        sent_at: null,
        sent_by: null,
      },
      {
        id: cancelledId,
        state: "CANCELLED",
        cancelled_at: new Date("2026-10-22T10:00:00Z"),
        cancelled_by: userId,
        sent_at: null,
        sent_by: null,
      },
    ]);
  });

  it("lets an order that was already there be marked sent and then cancelled", async () => {
    const database = await databaseBeforeMigration("_purchase_order_sent");
    const { draftId, userId } = await seededOrders(database);
    const migrated = await database.applyMigration();

    await migrated.query(
      "update purchase_orders set state = 'SENT', sent_at = '2026-10-23T10:00:00Z', sent_by = $2 where id = $1",
      [draftId, userId],
    );
    await migrated.query(
      "update purchase_orders set state = 'CANCELLED', cancelled_at = '2026-10-24T10:00:00Z', cancelled_by = $2 where id = $1",
      [draftId, userId],
    );

    const { rows } = await migrated.query(
      "select state, sent_at, sent_by from purchase_orders where id = $1",
      [draftId],
    );
    expect(rows).toEqual([
      { state: "CANCELLED", sent_at: new Date("2026-10-23T10:00:00Z"), sent_by: userId },
    ]);
  });
});
