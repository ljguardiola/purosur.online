import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_sale_line_promotion_kind");
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
  const insertLine = async (promotionId: string | null = null, columns = "", values = "") => {
    const { rows } = await database.query<{ id: string }>(
      `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total, promotion_id${columns})
       values (gen_random_uuid(), $1, $2, 'Yerba', 3, 2500, gen_random_uuid(), 0, 5000, $3${values}) returning id`,
      [saleId, productId, promotionId],
    );
    return rows[0]?.id as string;
  };
  const insertInboxEvent = (eventType: string, payload: unknown) =>
    database.query(
      `insert into inbox (event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version, payload, occurred_at, actor_id, chain_hmac, received_at)
       values (gen_random_uuid(), $1, (select coalesce(max(device_seq), 0) + 1 from inbox), 'Sale', $2, $3, 10, $4::jsonb, now(), 'user-1', 'hmac', now())`,
      [deviceId, saleId, eventType, JSON.stringify(payload)],
    );
  return { database, insertLine, insertInboxEvent };
}

const TWO_FOR_ONE = "b5d2f7a1-8c40-4e96-a3b7-1f9e6c4d2a10";
const TEN_OFF = "c9f4b2e7-1a58-4d36-8e0b-4a7c3f9d1e17";

const percentOff = (discountId: string) => ({
  discount_id: discountId,
  kind: "PERCENT_OFF",
  percent: 10,
  buy_qty: null,
  pay_qty: null,
});
const buyNPayM = (discountId: string) => ({
  discount_id: discountId,
  kind: "BUY_N_PAY_M",
  percent: null,
  buy_qty: 2,
  pay_qty: 1,
});

describe("the sale line promotion kind migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("fills the kind of the promotion each line applied from the sale_completed event that recorded it", async () => {
    const { database, insertLine, insertInboxEvent } = await databaseBefore();
    const buyLine = await insertLine(TWO_FOR_ONE);
    const percentLine = await insertLine(TEN_OFF);
    await insertInboxEvent("sale_completed", {
      lines: [
        { id: buyLine, promotion_id: TWO_FOR_ONE, promotions: [buyNPayM(TWO_FOR_ONE)] },
        {
          id: percentLine,
          promotion_id: TEN_OFF,
          promotions: [buyNPayM(TWO_FOR_ONE), percentOff(TEN_OFF)],
        },
      ],
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select id, promotion_kind from sale_lines where id in ($1, $2) order by promotion_kind",
      [buyLine, percentLine],
    );
    expect(rows).toEqual([
      { id: buyLine, promotion_kind: "BUY_N_PAY_M" },
      { id: percentLine, promotion_kind: "PERCENT_OFF" },
    ]);
  });

  it("leaves the kind empty for a promoted line no event describes, and for a line without a promotion", async () => {
    const { database, insertLine, insertInboxEvent } = await databaseBefore();
    const promotedWithoutEvent = await insertLine(TWO_FOR_ONE);
    const unpromoted = await insertLine();
    await insertInboxEvent("sale_completed", { lines: [] });
    await insertInboxEvent("sale_completed", { lines: "unreadable" });
    await insertInboxEvent("sale_completed", {
      lines: [{ id: unpromoted, promotion_id: null, promotions: [] }],
    });
    await insertInboxEvent("fiscal_gate_failed", { id: "not-a-sale" });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select id, promotion_kind from sale_lines where id in ($1, $2) order by id",
      [promotedWithoutEvent, unpromoted],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => (row as { promotion_kind: unknown }).promotion_kind === null)).toBe(
      true,
    );
  });

  it("leaves the kind empty when the event lists no promotion the line applied", async () => {
    const { database, insertLine, insertInboxEvent } = await databaseBefore();
    const line = await insertLine(TWO_FOR_ONE);
    await insertInboxEvent("sale_completed", {
      lines: [{ id: line, promotion_id: TWO_FOR_ONE, promotions: [percentOff(TEN_OFF)] }],
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select promotion_kind from sale_lines where id = $1", [
      line,
    ]);
    expect(rows).toEqual([{ promotion_kind: null }]);
  });

  it("still takes a promoted line recorded without its kind, as the previous release does during a deploy", async () => {
    const { database, insertLine } = await databaseBefore();
    const migrated = await database.applyMigration();

    const line = await insertLine(TWO_FOR_ONE);

    const { rows } = await migrated.query("select promotion_kind from sale_lines where id = $1", [
      line,
    ]);
    expect(rows).toEqual([{ promotion_kind: null }]);
  });

  it.each(["PERCENT_OFF", "BUY_N_PAY_M"])("records a promoted line of kind %s", async (kind) => {
    const { database, insertLine } = await databaseBefore();
    const migrated = await database.applyMigration();

    const line = await insertLine(TWO_FOR_ONE, ", promotion_kind", `, '${kind}'`);

    const { rows } = await migrated.query("select promotion_kind from sale_lines where id = $1", [
      line,
    ]);
    expect(rows).toEqual([{ promotion_kind: kind }]);
  });

  it("refuses a kind that is neither of the two promotion kinds", async () => {
    const { database, insertLine } = await databaseBefore();
    await database.applyMigration();

    await expect(insertLine(TWO_FOR_ONE, ", promotion_kind", ", 'FREE_SHIPPING'")).rejects.toThrow(
      /sale_lines_promotion_kind_check/,
    );
  });

  it("refuses a kind on a line without a promotion", async () => {
    const { database, insertLine } = await databaseBefore();
    await database.applyMigration();

    await expect(insertLine(null, ", promotion_kind", ", 'PERCENT_OFF'")).rejects.toThrow(
      /sale_lines_promotion_kind_check/,
    );
  });
});
