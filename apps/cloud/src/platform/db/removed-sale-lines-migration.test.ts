import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_removed_sale_lines");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const registerId = await first(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationId],
  );
  const deviceId = await first(
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerId],
  );
  const sessionId = await first(
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationId, registerId, deviceId],
  );
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const productId = await first(
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );
  const saleId = await first(
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, cancelled_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'CANCELLED', '2026-10-06T11:25:00Z', 4800, now()) returning id`,
    [locationId, registerId, deviceId, sessionId],
  );
  await database.query(
    `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
     values (gen_random_uuid(), $1, $2, 'Yerba', 2000, 2400, gen_random_uuid(), 0, 4800)`,
    [saleId, productId],
  );
  return { database, locationId, registerId, deviceId, sessionId, productId };
}

async function migratedDatabase() {
  const before = await databaseBefore();
  const migrated = await before.database.applyMigration();
  const insertRemovedLine = (
    overrides: { sessionId?: string; weightSource?: string | null } = {},
  ) =>
    migrated.query(
      `insert into removed_sale_lines
         (id, sale_id, location_id, register_id, device_id, session_id, actor_id, product_id, product_name,
          quantity, weight_source, line_total, removed_at, applied_at, origin_event_id)
       values (gen_random_uuid(), gen_random_uuid(), $1, $2, $3, $4, 'user-1', $5, 'Yerba',
          1250, $6, 3000, '2026-10-06T11:18:00Z', now(), gen_random_uuid())`,
      [
        before.locationId,
        before.registerId,
        before.deviceId,
        overrides.sessionId ?? before.sessionId,
        before.productId,
        overrides.weightSource === undefined ? null : overrides.weightSource,
      ],
    );
  return { migrated, insertRemovedLine };
}

describe("the removed sale lines migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the sales and their lines a database already holds, with no removed line", async () => {
    const { database } = await databaseBefore();

    const migrated = await database.applyMigration();

    expect((await migrated.query("select state, total from sales")).rows).toEqual([
      { state: "CANCELLED", total: 4800 },
    ]);
    expect((await migrated.query("select quantity, line_total from sale_lines")).rows).toEqual([
      { quantity: 2000, line_total: 4800 },
    ]);
    expect((await migrated.query("select id from removed_sale_lines")).rows).toEqual([]);
  });

  it.each([null, "SCALE", "MANUAL"])(
    "records a line removed from a sale the cloud does not hold, weighed by %s",
    async (weightSource) => {
      const { migrated, insertRemovedLine } = await migratedDatabase();

      await insertRemovedLine({ weightSource });

      expect(
        (await migrated.query("select quantity, weight_source, line_total from removed_sale_lines"))
          .rows,
      ).toEqual([{ quantity: 1250, weight_source: weightSource, line_total: 3000 }]);
    },
  );

  it("refuses a weight source that is neither the scale nor a typed entry", async () => {
    const { insertRemovedLine } = await migratedDatabase();

    await expect(insertRemovedLine({ weightSource: "SENSOR" })).rejects.toThrow(
      /removed_sale_lines_weight_source_check/,
    );
  });

  it("refuses a line removed in a cash session the cloud does not hold", async () => {
    const { insertRemovedLine } = await migratedDatabase();

    await expect(
      insertRemovedLine({ sessionId: "6c1f0d2e-4b7a-4e93-9a58-1d3e7b2c9f40" }),
    ).rejects.toThrow(/removed_sale_lines_session_id_cash_sessions_id_fk/);
  });
});
