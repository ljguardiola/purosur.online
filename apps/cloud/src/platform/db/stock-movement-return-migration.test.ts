import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_stock_movement_return");
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
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 7500, now()) returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
  const saleLine = (quantity: number) =>
    first(
      `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
       values (gen_random_uuid(), $1, $2, 'Yerba', $3, 2500, gen_random_uuid(), 0, $4) returning id`,
      [saleId, productId, quantity, quantity * 2500],
    );
  const movement = (kind: string, saleLineId: string | null, occurredAt: string) =>
    database.query(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, actor_id, sale_line_id, occurred_at)
       values ($1, $2, $3, $4, -1000, $5, $6, $7)`,
      [
        productId,
        locationId,
        kind,
        kind === "loss" && saleLineId ? "return_discard" : kind === "loss" ? "expired" : null,
        userId,
        saleLineId,
        occurredAt,
      ],
    );
  const saleReturn = async (
    saleLineId: string,
    occurredAt: string,
    returnLine: { resolution: string; disposition: string },
  ) => {
    const returnId = await first(
      `insert into returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at, origin_event_id)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, 'QR', $6, gen_random_uuid()) returning id`,
      [saleId, registerId, deviceId, sessionId, userId, occurredAt],
    );
    await database.query(
      `insert into return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount, resolution)
       values ($1, $2, 1, 'defective', $3, 0, $4)`,
      [returnId, saleLineId, returnLine.disposition, returnLine.resolution],
    );
    return returnId;
  };
  return { database, saleLine, movement, saleReturn };
}

describe("the stock movement return migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("gives each movement of a return the return it belongs to and leaves every other movement without one", async () => {
    const { database, saleLine, movement, saleReturn } = await databaseBefore();
    const refundedLine = await saleLine(2);
    const exchangedLine = await saleLine(2);
    const unreturnedLine = await saleLine(1);
    const refund = await saleReturn(refundedLine, "2026-03-01T10:00:00Z", {
      resolution: "refund",
      disposition: "discard",
    });
    const exchangeDiscard = await saleReturn(refundedLine, "2026-03-02T10:00:00Z", {
      resolution: "exchange",
      disposition: "discard",
    });
    const exchangeRestock = await saleReturn(exchangedLine, "2026-03-03T10:00:00Z", {
      resolution: "exchange",
      disposition: "restock",
    });
    await movement("sale", refundedLine, "2026-02-28T10:00:00Z");
    await movement("return", refundedLine, "2026-03-01T10:00:00Z");
    await movement("loss", refundedLine, "2026-03-01T10:00:00Z");
    await movement("return", refundedLine, "2026-03-02T10:00:00Z");
    await movement("loss", refundedLine, "2026-03-02T10:00:00Z");
    await movement("exchange_out", refundedLine, "2026-03-02T10:00:00Z");
    await movement("return", exchangedLine, "2026-03-03T10:00:00Z");
    await movement("exchange_out", exchangedLine, "2026-03-03T10:00:00Z");
    await movement("sale", unreturnedLine, "2026-02-28T10:00:00Z");
    await movement("loss", null, "2026-03-04T10:00:00Z");

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{
      kind: string;
      occurred_at: Date;
      return_id: string | null;
    }>("select kind, occurred_at, return_id from stock_movements order by occurred_at, kind");
    const returnIdsByMovement = rows.map(({ kind, occurred_at, return_id }) => [
      kind,
      occurred_at.toISOString(),
      return_id,
    ]);
    expect(returnIdsByMovement).toEqual([
      ["sale", "2026-02-28T10:00:00.000Z", null],
      ["sale", "2026-02-28T10:00:00.000Z", null],
      ["loss", "2026-03-01T10:00:00.000Z", refund],
      ["return", "2026-03-01T10:00:00.000Z", refund],
      ["exchange_out", "2026-03-02T10:00:00.000Z", exchangeDiscard],
      ["loss", "2026-03-02T10:00:00.000Z", exchangeDiscard],
      ["return", "2026-03-02T10:00:00.000Z", exchangeDiscard],
      ["exchange_out", "2026-03-03T10:00:00.000Z", exchangeRestock],
      ["return", "2026-03-03T10:00:00.000Z", exchangeRestock],
      ["loss", "2026-03-04T10:00:00.000Z", null],
    ]);
  });

  it("still takes a movement recorded without its return, as the previous release does during a deploy", async () => {
    const { database, saleLine, movement } = await databaseBefore();
    const line = await saleLine(1);
    const migrated = await database.applyMigration();

    await movement("return", line, "2026-03-01T10:00:00Z");

    const { rows } = await migrated.query("select return_id from stock_movements");
    expect(rows).toEqual([{ return_id: null }]);
  });
});
