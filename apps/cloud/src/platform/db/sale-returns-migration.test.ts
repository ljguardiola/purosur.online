import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_sale_returns");
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
  const paymentId = await first(
    `insert into sale_payments (id, sale_id, method, provider, amount, tendered, state, occurred_at)
     values (gen_random_uuid(), $1, 'CASH', 'NONE', 4800, 5000, 'APPROVED', now()) returning id`,
    [saleId],
  );
  return {
    database,
    locationId,
    registerId,
    deviceId,
    sessionId,
    productId,
    userId,
    saleId,
    saleLineId,
    paymentId,
  };
}

async function migratedDatabase() {
  const before = await databaseBefore();
  const migrated = await before.database.applyMigration();
  const insertReturn = (overrides: { ticketSource?: string; originEventId?: string } = {}) =>
    migrated.query<{ id: string }>(
      `insert into returns (id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at, origin_event_id)
       values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', null, $5, '2026-10-20T10:00:00Z', $6) returning id`,
      [
        before.saleId,
        before.registerId,
        before.deviceId,
        before.sessionId,
        overrides.ticketSource ?? "QR",
        overrides.originEventId ?? "5f0c2a64-9c63-4a4e-8c4e-0d5f0a7b9c11",
      ],
    );
  const insertLine = (
    returnId: string,
    overrides: { quantity?: number; reason?: string; disposition?: string; refunded?: number } = {},
  ) =>
    migrated.query(
      `insert into return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        returnId,
        before.saleLineId,
        overrides.quantity ?? 1000,
        overrides.reason ?? "change_of_mind",
        overrides.disposition ?? "restock",
        overrides.refunded ?? 2400,
      ],
    );
  return { ...before, migrated, insertReturn, insertLine };
}

describe("the sale returns migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the sales, payments, stock movements and refunds a database already holds", async () => {
    const { database, saleId, paymentId, productId, locationId, userId } = await databaseBefore();
    await database.query(
      `insert into payment_refunds (id, sale_id, payment_id, origin, method, provider, amount, state, occurred_at)
       values (gen_random_uuid(), $1, $2, 'sale_voided', 'CASH', 'NONE', 100, 'APPROVED', now())`,
      [saleId, paymentId],
    );
    await database.query(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id)
       values ($1, $2, 'loss', 'spoiled', -1000, now(), $3)`,
      [productId, locationId, userId],
    );

    const migrated = await database.applyMigration();

    expect((await migrated.query("select origin, amount from payment_refunds")).rows).toEqual([
      { origin: "sale_voided", amount: 100 },
    ]);
    expect((await migrated.query("select kind, reason from stock_movements")).rows).toEqual([
      { kind: "loss", reason: "spoiled" },
    ]);
    expect((await migrated.query("select state, total from sales")).rows).toEqual([
      { state: "COMPLETED", total: 4800 },
    ]);
  });

  describe("a return and its lines", () => {
    it("records a return of each ticket source with its lines", async () => {
      const { migrated, insertReturn, insertLine, saleLineId } = await migratedDatabase();

      const [qr] = (await insertReturn({ ticketSource: "QR" })).rows;
      const [typed] = (
        await insertReturn({
          ticketSource: "TYPED",
          originEventId: "8d1e5b7a-3c42-4f6a-9b1d-2a7c4e6f8a22",
        })
      ).rows;
      await insertLine(qr?.id as string);
      await insertLine(typed?.id as string, { reason: "defective", disposition: "discard" });

      expect(
        (await migrated.query("select ticket_source from returns order by ticket_source")).rows,
      ).toEqual([{ ticket_source: "QR" }, { ticket_source: "TYPED" }]);
      expect(
        (
          await migrated.query(
            "select sale_line_id, quantity, reason, disposition, refunded_amount from return_lines order by reason",
          )
        ).rows,
      ).toEqual([
        {
          sale_line_id: saleLineId,
          quantity: 1000,
          reason: "change_of_mind",
          disposition: "restock",
          refunded_amount: 2400,
        },
        {
          sale_line_id: saleLineId,
          quantity: 1000,
          reason: "defective",
          disposition: "discard",
          refunded_amount: 2400,
        },
      ]);
    });

    it("refuses a ticket source other than a scan or a typed number", async () => {
      const { insertReturn } = await migratedDatabase();

      await expect(insertReturn({ ticketSource: "SEARCHED" })).rejects.toThrow(
        /returns_ticket_source_check/,
      );
    });

    it("records the event a return came from once", async () => {
      const { insertReturn } = await migratedDatabase();
      await insertReturn();

      await expect(insertReturn()).rejects.toThrow(/returns_origin_event_id_key/);
    });

    it.each([
      ["a quantity of zero", { quantity: 0 }, /return_lines_quantity_check/],
      [
        "a reason that is neither a change of mind nor a defect",
        { reason: "cheaper" },
        /return_lines_reason_check/,
      ],
      [
        "a disposition that is neither restock nor discard",
        { disposition: "keep" },
        /return_lines_disposition_check/,
      ],
      ["a negative refund", { refunded: -1 }, /return_lines_refunded_amount_check/],
    ])("refuses a line with %s", async (_description, overrides, error) => {
      const { insertReturn, insertLine } = await migratedDatabase();
      const [returned] = (await insertReturn()).rows;

      await expect(insertLine(returned?.id as string, overrides)).rejects.toThrow(error);
    });

    it("lets the cloud application record a return and its lines, and neither change nor remove them", async () => {
      const { migrated, insertReturn, insertLine } = await migratedDatabase();
      await migrated.query("set role cloud_app");

      const [returned] = (await insertReturn()).rows;
      await insertLine(returned?.id as string);

      await expect(migrated.query("update returns set actor_id = 'user-2'")).rejects.toThrow(
        /permission denied/,
      );
      await expect(migrated.query("delete from returns")).rejects.toThrow(/permission denied/);
      await expect(migrated.query("update return_lines set quantity = 1")).rejects.toThrow(
        /permission denied/,
      );
      await expect(migrated.query("delete from return_lines")).rejects.toThrow(/permission denied/);
    });
  });

  describe("the payment refunds of a return", () => {
    it("records a refund of origin return against a payment of its sale", async () => {
      const { migrated, saleId, paymentId } = await migratedDatabase();

      await migrated.query(
        `insert into payment_refunds (id, sale_id, payment_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, 'return', 'CASH', 'NONE', 2400, 'APPROVED', now())`,
        [saleId, paymentId],
      );

      expect((await migrated.query("select origin, amount from payment_refunds")).rows).toEqual([
        { origin: "return", amount: 2400 },
      ]);
    });

    it("refuses a refund of origin return that names no payment", async () => {
      const { migrated, saleId } = await migratedDatabase();

      await expect(
        migrated.query(
          `insert into payment_refunds (id, sale_id, payment_id, origin, method, provider, amount, state, occurred_at)
           values (gen_random_uuid(), $1, null, 'return', 'CASH', 'NONE', 2400, 'APPROVED', now())`,
          [saleId],
        ),
      ).rejects.toThrow(/payment_refunds_source_check/);
    });
  });

  describe("the stock movements of a return", () => {
    it("records the merchandise coming back against the sale line it was sold on", async () => {
      const { migrated, productId, locationId, userId, saleLineId } = await migratedDatabase();

      await migrated.query(
        `insert into stock_movements (product_id, location_id, kind, reason, sale_line_id, delta, occurred_at, actor_id)
         values ($1, $2, 'return', null, $3, 1000, now(), $4)`,
        [productId, locationId, saleLineId, userId],
      );

      expect((await migrated.query("select kind, delta from stock_movements")).rows).toEqual([
        { kind: "return", delta: 1000 },
      ]);
    });

    it("refuses a return that names no sale line, or a reason", async () => {
      const { migrated, productId, locationId, userId, saleLineId } = await migratedDatabase();

      await expect(
        migrated.query(
          `insert into stock_movements (product_id, location_id, kind, reason, sale_line_id, delta, occurred_at, actor_id)
           values ($1, $2, 'return', null, null, 1000, now(), $3)`,
          [productId, locationId, userId],
        ),
      ).rejects.toThrow(/stock_movements_sale_line_iff_sale_check/);
      await expect(
        migrated.query(
          `insert into stock_movements (product_id, location_id, kind, reason, sale_line_id, delta, occurred_at, actor_id)
           values ($1, $2, 'return', 'spoiled', $3, 1000, now(), $4)`,
          [productId, locationId, saleLineId, userId],
        ),
      ).rejects.toThrow(/stock_movements_reason_unless_count_sale_or_receipt_check/);
    });

    it("records a discarded return as a loss for its system reason", async () => {
      const { migrated, productId, locationId, userId } = await migratedDatabase();

      await migrated.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id)
         values ($1, $2, 'loss', 'return_discard', -1000, now(), $3)`,
        [productId, locationId, userId],
      );

      expect((await migrated.query("select kind, reason from stock_movements")).rows).toEqual([
        { kind: "loss", reason: "return_discard" },
      ]);
    });
  });
});
