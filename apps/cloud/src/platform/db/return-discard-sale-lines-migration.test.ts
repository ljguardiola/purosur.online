import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_return_discard_sale_lines");
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
     values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'COMPLETED', '2026-10-06T11:20:00Z', 4800, now()) returning id`,
    [locationId, registerId, deviceId, sessionId],
  );
  const saleLineId = await first(
    `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
     values (gen_random_uuid(), $1, $2, 'Yerba', 2000, 2400, gen_random_uuid(), 0, 4800) returning id`,
    [saleId, productId],
  );

  let deviceSeq = 0;
  const movement = (
    kind: string,
    reason: string | null,
    lineId: string | null,
    delta: number,
    id: string = randomUUID(),
  ) =>
    first(
      `insert into stock_movements (id, product_id, location_id, kind, reason, sale_line_id, delta, occurred_at, actor_id)
       values ($1, $2, $3, $4, $5, $6, $7, '2026-10-08T10:00:00Z', $8) returning id`,
      [id, productId, locationId, kind, reason, lineId, delta, userId],
    );
  const returnedEvent = (
    schemaVersion: number,
    movements: { id: string; kind: string; reason: string | null }[],
    appliedAt: string | null = "2026-10-08T10:00:05Z",
  ) => {
    deviceSeq += 1;
    return database.query(
      `insert into inbox
         (event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
          payload, occurred_at, actor_id, chain_hmac, received_at, applied_at)
       values (gen_random_uuid(), $1, $2, 'Return', gen_random_uuid()::text, 'sale_returned', $3,
               $4::jsonb, '2026-10-08T10:00:00Z', 'user-1', 'hmac', '2026-10-08T10:00:01Z', $5)`,
      [
        deviceId,
        deviceSeq,
        schemaVersion,
        JSON.stringify({
          stock_movements: movements.map((returned) => ({
            ...returned,
            sale_line_id: saleLineId,
            product_id: productId,
            delta: returned.kind === "loss" ? -1000 : 1000,
            occurred_at: "2026-10-08T10:00:00.000Z",
          })),
        }),
        appliedAt,
      ],
    );
  };
  const discardedReturn = async (schemaVersion: number) => {
    const returnId = await movement("return", null, saleLineId, 1000);
    const lossId = await movement("loss", "return_discard", null, -1000);
    await returnedEvent(schemaVersion, [
      { id: returnId, kind: "return", reason: null },
      { id: lossId, kind: "loss", reason: "return_discard" },
    ]);
    return lossId;
  };
  return { database, movement, returnedEvent, discardedReturn, saleLineId };
}

async function saleLinesById(database: { query: (sql: string) => Promise<{ rows: unknown[] }> }) {
  const { rows } = await database.query("select id, sale_line_id from stock_movements");
  return Object.fromEntries(
    (rows as { id: string; sale_line_id: string | null }[]).map((row) => [
      row.id,
      row.sale_line_id,
    ]),
  );
}

describe("the return discard sale lines migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("gives each discard loss the sale line its applied return event named for it, at every schema version", async () => {
    const { database, discardedReturn, saleLineId } = await databaseBefore();
    const losses = [await discardedReturn(1), await discardedReturn(2), await discardedReturn(3)];

    const migrated = await database.applyMigration();

    const lines = await saleLinesById(migrated);
    expect(losses.map((lossId) => lines[lossId])).toEqual([saleLineId, saleLineId, saleLineId]);
  });

  it("leaves every other movement's sale line as it was", async () => {
    const { database, movement, discardedReturn, saleLineId } = await databaseBefore();
    await discardedReturn(3);
    const sold = await movement("sale", null, saleLineId, -2000);
    const spoiled = await movement("loss", "spoiled", null, -1000);

    const migrated = await database.applyMigration();

    const lines = await saleLinesById(migrated);
    expect([lines[sold], lines[spoiled]]).toEqual([saleLineId, null]);
  });

  it("refuses to migrate a discard loss no applied return event names", async () => {
    const { database, movement, returnedEvent } = await databaseBefore();
    const lossId = await movement("loss", "return_discard", null, -1000);
    await returnedEvent(3, [{ id: lossId, kind: "loss", reason: "return_discard" }], null);

    await expect(database.applyMigration()).rejects.toThrow(
      'ADD CONSTRAINT "stock_movements_sale_line_iff_sale_check"',
    );
  });

  it("refuses afterwards a discard loss without a sale line and any other loss with one", async () => {
    const { database, movement, saleLineId } = await databaseBefore();
    await database.applyMigration();

    await expect(movement("loss", "return_discard", null, -1000)).rejects.toThrow(
      "stock_movements_sale_line_iff_sale_check",
    );
    await expect(movement("loss", "spoiled", saleLineId, -1000)).rejects.toThrow(
      "stock_movements_sale_line_iff_sale_check",
    );
    await expect(movement("loss", "return_discard", saleLineId, -1000)).resolves.toEqual(
      expect.any(String),
    );
  });
});
