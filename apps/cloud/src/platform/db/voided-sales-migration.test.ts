import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_voided_sales");
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
  return { database, locationId, registerId, deviceId, sessionId, productId, userId };
}

describe("the voided sales migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded sale and every refund, none of them voided", async () => {
    const { database, locationId, registerId, deviceId, sessionId } = await databaseBefore();
    await database.query(
      `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'COMPLETED', '2026-10-06T11:20:00Z', 4800, now())`,
      [locationId, registerId, deviceId, sessionId],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select state, completed_at, voided_at, void_authorized_by, total from sales",
    );
    expect(rows).toEqual([
      {
        state: "COMPLETED",
        completed_at: new Date("2026-10-06T11:20:00Z"),
        voided_at: null,
        void_authorized_by: null,
        total: 4800,
      },
    ]);
  });

  describe("a sale's state against its timestamps", () => {
    async function migratedDatabase() {
      const before = await databaseBefore();
      const migrated = await before.database.applyMigration();
      const insert = async (
        state: string,
        timestamps: { completedAt?: string; cancelledAt?: string; voidedAt?: string },
        voidAuthorizedBy: string | null = null,
      ) =>
        migrated.query(
          `insert into sales
             (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, cancelled_at, voided_at, void_authorized_by, total, applied_at)
           values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', $5, $6, $7, $8, $9, 100, now())`,
          [
            before.locationId,
            before.registerId,
            before.deviceId,
            before.sessionId,
            state,
            timestamps.completedAt ?? null,
            timestamps.cancelledAt ?? null,
            timestamps.voidedAt ?? null,
            voidAuthorizedBy,
          ],
        );
      return insert;
    }

    it("keeps a voided sale's completion time and holds its voiding time", async () => {
      const insert = await migratedDatabase();

      await expect(
        insert("VOIDED", {
          completedAt: "2026-10-06T11:20:00Z",
          voidedAt: "2026-10-06T11:40:00Z",
        }),
      ).resolves.toBeDefined();
      await expect(insert("VOIDED", { completedAt: "2026-10-06T11:20:00Z" })).rejects.toThrow(
        /sales_state_matches_timestamps_check/,
      );
      await expect(insert("VOIDED", { voidedAt: "2026-10-06T11:40:00Z" })).rejects.toThrow(
        /sales_state_matches_timestamps_check/,
      );
      await expect(
        insert("VOIDED", {
          completedAt: "2026-10-06T11:20:00Z",
          cancelledAt: "2026-10-06T11:30:00Z",
          voidedAt: "2026-10-06T11:40:00Z",
        }),
      ).rejects.toThrow(/sales_state_matches_timestamps_check/);
    });

    it("refuses a completed or cancelled sale that carries a voiding time", async () => {
      const insert = await migratedDatabase();

      await expect(
        insert("COMPLETED", {
          completedAt: "2026-10-06T11:20:00Z",
          voidedAt: "2026-10-06T11:40:00Z",
        }),
      ).rejects.toThrow(/sales_state_matches_timestamps_check/);
      await expect(
        insert("CANCELLED", {
          cancelledAt: "2026-10-06T11:20:00Z",
          voidedAt: "2026-10-06T11:40:00Z",
        }),
      ).rejects.toThrow(/sales_state_matches_timestamps_check/);
    });

    it("still accepts a completed sale and a cancelled sale", async () => {
      const insert = await migratedDatabase();

      await expect(
        insert("COMPLETED", { completedAt: "2026-10-06T11:20:00Z" }),
      ).resolves.toBeDefined();
      await expect(
        insert("CANCELLED", { cancelledAt: "2026-10-06T11:20:00Z" }),
      ).resolves.toBeDefined();
    });

    it("refuses a state outside the three it knows", async () => {
      const insert = await migratedDatabase();

      await expect(insert("RETURNED", { completedAt: "2026-10-06T11:20:00Z" })).rejects.toThrow(
        /sales_state_check/,
      );
    });

    it("holds who authorized the voiding only on a voided sale", async () => {
      const insert = await migratedDatabase();
      const voided = { completedAt: "2026-10-06T11:20:00Z", voidedAt: "2026-10-06T11:40:00Z" };

      await expect(insert("VOIDED", voided, "supervisor-1")).resolves.toBeDefined();
      await expect(
        insert("COMPLETED", { completedAt: "2026-10-06T11:20:00Z" }, "supervisor-1"),
      ).rejects.toThrow(/sales_void_authorizer_only_when_voided_check/);
    });
  });

  describe("the refund of a voided sale", () => {
    async function saleWithPayment() {
      const before = await databaseBefore();
      const saleId = await before.database
        .query<{ id: string }>(
          `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
           values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'COMPLETED', now(), 100, now()) returning id`,
          [before.locationId, before.registerId, before.deviceId, before.sessionId],
        )
        .then(({ rows }) => rows[0]?.id as string);
      const paymentId = await before.database
        .query<{ id: string }>(
          `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
           values (gen_random_uuid(), $1, 'TRANSFER', 'NONE', 100, 'APPROVED', now()) returning id`,
          [saleId],
        )
        .then(({ rows }) => rows[0]?.id as string);
      const migrated = await before.database.applyMigration();
      const insertRefund = (origin: string, paymentIdOfRefund: string | null) =>
        migrated.query(
          `insert into payment_refunds (id, sale_id, payment_id, origin, method, provider, amount, state, occurred_at)
           values (gen_random_uuid(), $1, $2, $3, 'TRANSFER', 'NONE', 100, 'PENDING', now())`,
          [saleId, paymentIdOfRefund, origin],
        );
      return { insertRefund, paymentId };
    }

    it("is recorded against the payment it refunds, with the origin of a voided sale", async () => {
      const { insertRefund, paymentId } = await saleWithPayment();

      await expect(insertRefund("sale_voided", paymentId)).resolves.toBeDefined();
    });

    it("refuses a voided sale's refund that names no payment, and an origin outside the catalog", async () => {
      const { insertRefund, paymentId } = await saleWithPayment();

      await expect(insertRefund("sale_voided", null)).rejects.toThrow();
      await expect(insertRefund("sale_returned", paymentId)).rejects.toThrow(
        /payment_refunds_origin_check/,
      );
    });
  });

  describe("the stock a voided sale returns", () => {
    async function migratedStock() {
      const before = await databaseBefore();
      const { rows: saleRows } = await before.database.query<{ id: string }>(
        `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now()) returning id`,
        [before.locationId, before.registerId, before.deviceId, before.sessionId, before.userId],
      );
      const { rows: lineRows } = await before.database.query<{ id: string }>(
        `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
         values (gen_random_uuid(), $1, $2, 'Yerba', 1, 2500, gen_random_uuid(), 0, 2500) returning id`,
        [saleRows[0]?.id, before.productId],
      );
      const saleLineId = lineRows[0]?.id;
      const migrated = await before.database.applyMigration();
      const insertMovement = (
        kind: string,
        reason: string | null,
        lineId: string | null,
        delta = 1000,
      ) =>
        migrated.query(
          `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, sale_line_id)
           values ($1, $2, $3, $4, $5, now(), $6, $7)`,
          [before.productId, before.locationId, kind, reason, delta, before.userId, lineId],
        );
      return { insertMovement, saleLineId: saleLineId as string, migrated };
    }

    it("is recorded against the sale line it returns, with no reason", async () => {
      const { insertMovement, saleLineId, migrated } = await migratedStock();

      await insertMovement("sale_void", null, saleLineId);

      const { rows } = await migrated.query(
        "select kind, reason, sale_line_id, delta from stock_movements",
      );
      expect(rows).toEqual([
        { kind: "sale_void", reason: null, sale_line_id: saleLineId, delta: 1000 },
      ]);
    });

    it("refuses a return with a reason or without a sale line", async () => {
      const { insertMovement, saleLineId } = await migratedStock();

      await expect(insertMovement("sale_void", "broken_or_spilled", saleLineId)).rejects.toThrow(
        /stock_movements_reason_unless_count_sale_or_receipt_check/,
      );
      await expect(insertMovement("sale_void", null, null)).rejects.toThrow(
        /stock_movements_sale_line_iff_sale_check/,
      );
    });

    it("still ties a sale's own movement to its sale line and refuses a sale line on any other kind", async () => {
      const { insertMovement, saleLineId } = await migratedStock();

      await expect(insertMovement("sale", null, saleLineId, -1000)).resolves.toBeDefined();
      await expect(insertMovement("sale", null, null, -1000)).rejects.toThrow(
        /stock_movements_sale_line_iff_sale_check/,
      );
      await expect(insertMovement("loss", "broken_or_spilled", saleLineId, -1000)).rejects.toThrow(
        /stock_movements_sale_line_iff_sale_check/,
      );
    });
  });
});
