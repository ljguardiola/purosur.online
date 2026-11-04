import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

type Database = Awaited<ReturnType<typeof databaseBeforeMigration>>;

async function first(database: Database, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await database.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("test setup: the insert returned no row");
  }
  return id;
}

async function databaseHoldingSales() {
  const database = await databaseBeforeMigration("_drop_removed_lines_and_unpaid_cancelled_sales");
  const locationId = await first(database, "select id from locations limit 1");
  const registerId = await first(
    database,
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationId],
  );
  const deviceId = await first(
    database,
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerId],
  );
  const sessionId = await first(
    database,
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationId, registerId, deviceId],
  );
  const userId = await first(
    database,
    `insert into users (first_name, email, location_id)
     values ('Ada', 'ada@example.com', $1) returning id`,
    [locationId],
  );
  const categoryId = await first(
    database,
    "insert into categories (name) values ('Almacen') returning id",
  );
  const productId = await first(
    database,
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );

  async function sale(state: "CANCELLED" | "COMPLETED") {
    const saleId = await first(
      database,
      `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, cancelled_at, total, applied_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', $5,
         case when $5 = 'COMPLETED' then now() end, case when $5 = 'CANCELLED' then now() end, 4800, now())
       returning id`,
      [locationId, registerId, deviceId, sessionId, state],
    );
    const lineId = await first(
      database,
      `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
       values (gen_random_uuid(), $1, $2, 'Yerba', 2000, 2400, gen_random_uuid(), 0, 4800) returning id`,
      [saleId, productId],
    );
    return { saleId, lineId };
  }

  async function payment(saleId: string, state: "APPROVED" | "DECLINED") {
    return first(
      database,
      `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
       values (gen_random_uuid(), $1, 'CASH', 'NONE', 4800, $2, now()) returning id`,
      [saleId, state],
    );
  }

  async function refund(saleId: string, paymentId: string) {
    await database.query(
      `insert into payment_refunds (id, sale_id, payment_id, origin, method, provider, amount, state, occurred_at)
       values (gen_random_uuid(), $1, $2, 'sale_cancelled', 'CASH', 'NONE', 4800, 'PENDING', now())`,
      [saleId, paymentId],
    );
  }

  async function latePaymentRefund(saleId: string) {
    const transactionId = await first(
      database,
      `insert into payment_transactions
         (id, register_id, sale_id, kind, method, provider, amount, state, replaced, created_at, expires_at)
       values (gen_random_uuid(), $1, $2, 'SALE', 'QR', 'MERCADOPAGO_QR', 4800,
               'APPROVED', false, now(), now() + interval '5 minutes') returning id`,
      [registerId, saleId],
    );
    return first(
      database,
      `insert into payment_refunds
         (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
       values (gen_random_uuid(), $1, $2, 'late_payment', 'QR', 'MERCADOPAGO_QR', 4800, 'PENDING', now())
       returning id`,
      [saleId, transactionId],
    );
  }

  async function reprint(saleId: string) {
    await database.query(
      `insert into sale_reprints (sale_id, document, order_number, requested_by, reason_kind, occurred_at)
       values ($1, 'sale_receipt', 1, 'user-1', 'retry', now())`,
      [saleId],
    );
  }

  async function stockMovement(lineId: string, locationForMovement: string) {
    await database.query(
      `insert into stock_movements (product_id, location_id, kind, sale_line_id, delta, occurred_at, actor_id)
       values ($1, $2, 'sale', $3, -2000, now(), $4)`,
      [productId, locationForMovement, lineId, userId],
    );
  }

  async function removedLine(saleId: string) {
    await database.query(
      `insert into removed_sale_lines
         (id, sale_id, location_id, register_id, device_id, session_id, actor_id, product_id, product_name,
          quantity, weight_source, line_total, removed_at, applied_at, origin_event_id)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, 'user-1', $6, 'Yerba',
          1250, null, 3000, '2026-10-06T11:18:00Z', now(), gen_random_uuid())`,
      [saleId, locationId, registerId, deviceId, sessionId, productId],
    );
  }

  return {
    database,
    locationId,
    sale,
    payment,
    refund,
    latePaymentRefund,
    reprint,
    stockMovement,
    removedLine,
  };
}

async function ids(database: Awaited<ReturnType<Database["applyMigration"]>>, sql: string) {
  const { rows } = await database.query<{ id: string }>(sql);
  return rows.map(({ id }) => id).sort();
}

describe("the drop removed lines and unpaid cancelled sales migration", { timeout: 30_000 }, () => {
  it("removes a cancelled sale that took no approved payment with everything it holds", async () => {
    const held = await databaseHoldingSales();
    const unpaid = await held.sale("CANCELLED");
    await held.payment(unpaid.saleId, "DECLINED");
    await held.reprint(unpaid.saleId);
    await held.sale("CANCELLED");

    const migrated = await held.database.applyMigration();

    expect(await ids(migrated, "select id from sales")).toEqual([]);
    expect(await ids(migrated, "select id from sale_lines")).toEqual([]);
    expect(await ids(migrated, "select id from sale_payments")).toEqual([]);
    expect(await ids(migrated, "select id from payment_refunds")).toEqual([]);
    expect(await ids(migrated, "select sale_id as id from sale_reprints")).toEqual([]);
  });

  it("keeps a cancelled sale with an approved payment, its lines, payments and refunds", async () => {
    const held = await databaseHoldingSales();
    const paid = await held.sale("CANCELLED");
    const approved = await held.payment(paid.saleId, "APPROVED");
    const declined = await held.payment(paid.saleId, "DECLINED");
    await held.refund(paid.saleId, approved);
    await held.reprint(paid.saleId);

    const migrated = await held.database.applyMigration();

    expect(await ids(migrated, "select id from sales")).toEqual([paid.saleId]);
    expect(await ids(migrated, "select id from sale_lines")).toEqual([paid.lineId]);
    expect(await ids(migrated, "select id from sale_payments")).toEqual(
      [approved, declined].sort(),
    );
    expect((await migrated.query("select sale_id, payment_id from payment_refunds")).rows).toEqual([
      { sale_id: paid.saleId, payment_id: approved },
    ]);
    expect(await ids(migrated, "select sale_id as id from sale_reprints")).toEqual([paid.saleId]);
  });

  it("keeps a cancelled sale with no approved payment that still owes a refund, with that refund", async () => {
    const held = await databaseHoldingSales();
    const owing = await held.sale("CANCELLED");
    const refundId = await held.latePaymentRefund(owing.saleId);

    const migrated = await held.database.applyMigration();

    expect(await ids(migrated, "select id from sales")).toEqual([owing.saleId]);
    expect(await ids(migrated, "select id from sale_lines")).toEqual([owing.lineId]);
    expect(await ids(migrated, "select id from payment_refunds")).toEqual([refundId]);
  });

  it("keeps a completed sale, even one with a payment that was not approved", async () => {
    const held = await databaseHoldingSales();
    const completed = await held.sale("COMPLETED");
    await held.payment(completed.saleId, "DECLINED");

    const migrated = await held.database.applyMigration();

    expect(await ids(migrated, "select id from sales")).toEqual([completed.saleId]);
    expect(await ids(migrated, "select id from sale_lines")).toEqual([completed.lineId]);
    expect(await ids(migrated, "select id from sale_payments")).toHaveLength(1);
  });

  it("keeps a cancelled sale with no approved payment that a stock movement refers to", async () => {
    const held = await databaseHoldingSales();
    const referenced = await held.sale("CANCELLED");
    await held.stockMovement(referenced.lineId, held.locationId);

    const migrated = await held.database.applyMigration();

    expect(await ids(migrated, "select id from sales")).toEqual([referenced.saleId]);
    expect(await ids(migrated, "select id from sale_lines")).toEqual([referenced.lineId]);
  });

  it("drops the removed sale lines table with what it held", async () => {
    const held = await databaseHoldingSales();
    await held.removedLine((await held.sale("COMPLETED")).saleId);

    const migrated = await held.database.applyMigration();

    await expect(migrated.query("select id from removed_sale_lines")).rejects.toThrow(
      /relation "removed_sale_lines" does not exist/,
    );
  });
});
