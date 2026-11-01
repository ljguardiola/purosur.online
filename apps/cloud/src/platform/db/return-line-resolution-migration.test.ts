import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_return_line_resolution");
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
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const saleId = await first(
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 5000, now()) returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
  const saleLineId = await first(
    `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
     values (gen_random_uuid(), $1, $2, 'Yerba', 2, 2500, gen_random_uuid(), 0, 5000) returning id`,
    [saleId, productId],
  );
  const returnId = await first(
    `insert into returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at, origin_event_id)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'QR', now(), gen_random_uuid()) returning id`,
    [saleId, registerId, deviceId, sessionId, userId],
  );
  const insertLine = (columns = "", values = "") =>
    database.query<{ resolution: string }>(
      `insert into return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount${columns})
       values ($1, $2, 1, 'defective', 'discard', 0${values}) returning *`,
      [returnId, saleLineId],
    );
  const insertMovement = (kind: string, withSaleLine: boolean) =>
    database.query(
      `insert into stock_movements (product_id, location_id, kind, delta, actor_id, sale_line_id)
       values ($1, $2, $3, -1000, $4, $5)`,
      [productId, locationId, kind, userId, withSaleLine ? saleLineId : null],
    );
  return { database, insertLine, insertMovement };
}

describe("the return line resolution migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("takes every existing return line as refunded", async () => {
    const { database, insertLine } = await databaseBefore();
    await insertLine();

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select resolution from return_lines");
    expect(rows).toEqual([{ resolution: "refund" }]);
  });

  it("still takes a line recorded without its resolution, as the previous release does during a deploy", async () => {
    const { database, insertLine } = await databaseBefore();
    await database.applyMigration();

    const { rows } = await insertLine();

    expect(rows[0]?.resolution).toBe("refund");
  });

  it("records an exchanged line", async () => {
    const { database, insertLine } = await databaseBefore();
    await database.applyMigration();

    const { rows } = await insertLine(", resolution", ", 'exchange'");

    expect(rows[0]?.resolution).toBe("exchange");
  });

  it("refuses a resolution that is neither refund nor exchange", async () => {
    const { database, insertLine } = await databaseBefore();
    await database.applyMigration();

    await expect(insertLine(", resolution", ", 'store_credit'")).rejects.toThrow(
      /return_lines_resolution_check/,
    );
  });

  it("records an exchange movement of a sale line", async () => {
    const { database, insertMovement } = await databaseBefore();
    const migrated = await database.applyMigration();

    await insertMovement("exchange_out", true);

    const { rows } = await migrated.query("select kind from stock_movements");
    expect(rows).toEqual([{ kind: "exchange_out" }]);
  });

  it("refuses an exchange movement that names no sale line", async () => {
    const { database, insertMovement } = await databaseBefore();
    await database.applyMigration();

    await expect(insertMovement("exchange_out", false)).rejects.toThrow(
      /stock_movements_sale_line_iff_sale_check/,
    );
  });
});
