import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_manual_line_adjustments");
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
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now()) returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
  const insertLine = (sql: SqlOnlyDatabase, columns = "", values = "") =>
    sql.query(
      `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total${columns})
       values (gen_random_uuid(), $1, $2, 'Yerba', 1, 2500, gen_random_uuid(), 0, 2500${values})`,
      [saleId, productId],
    );
  return { database, insertLine };
}

const ADJUSTMENT_COLUMNS =
  ", manual_adjustment_kind, manual_adjustment_value, manual_adjustment_reason, manual_adjustment_authorized_by";

describe("the manual line adjustments migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded line, none of them adjusted", async () => {
    const { database, insertLine } = await databaseBefore();
    await insertLine(database);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(`select line_total${ADJUSTMENT_COLUMNS} from sale_lines`);
    expect(rows).toEqual([
      {
        line_total: 2500,
        manual_adjustment_kind: null,
        manual_adjustment_value: null,
        manual_adjustment_reason: null,
        manual_adjustment_authorized_by: null,
      },
    ]);
  });

  it.each([
    ["PRICE", 0, null],
    ["PRICE", 2000, "supervisor"],
    ["PERCENT", 1, null],
    ["PERCENT", 100, "supervisor"],
    ["AMOUNT", 300, null],
  ])(
    "records a line adjusted with a %s of %i authorized by %s",
    async (kind, value, authorizer) => {
      const { database, insertLine } = await databaseBefore();
      const migrated = await database.applyMigration();

      await insertLine(
        migrated,
        ADJUSTMENT_COLUMNS,
        `, '${kind}', ${value}, 'Cliente frecuente', ${authorizer === null ? "null" : `'${authorizer}'`}`,
      );

      const { rows } = await migrated.query(
        "select manual_adjustment_kind, manual_adjustment_value from sale_lines",
      );
      expect(rows).toEqual([{ manual_adjustment_kind: kind, manual_adjustment_value: value }]);
    },
  );

  it.each([
    ["a kind nobody records", ", 'BONUS', 10, 'Motivo', null"],
    ["a price below zero", ", 'PRICE', -1, 'Motivo', null"],
    ["a percent of zero", ", 'PERCENT', 0, 'Motivo', null"],
    ["a percent over one hundred", ", 'PERCENT', 101, 'Motivo', null"],
    ["an amount of zero", ", 'AMOUNT', 0, 'Motivo', null"],
    ["a kind without its value", ", 'AMOUNT', null, 'Motivo', null"],
    ["a value without its kind", ", null, 10, 'Motivo', null"],
    ["a kind without its reason", ", 'AMOUNT', 300, null, null"],
    ["a blank reason", ", 'AMOUNT', 300, '  ', null"],
    ["a reason without its kind", ", null, null, 'Motivo', null"],
    ["an authorizer without an adjustment", ", null, null, null, 'supervisor'"],
  ])("refuses %s", async (_case, values) => {
    const { database, insertLine } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(insertLine(migrated, ADJUSTMENT_COLUMNS, values)).rejects.toThrow(
      /sale_lines_manual_adjustment/,
    );
  });
});
