import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_cancelled_sales");
  const { rows: locationRows } = await database.query<{ id: string }>(
    "select id from locations limit 1",
  );
  const { rows: registerRows } = await database.query<{ id: string }>(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationRows[0]?.id],
  );
  const { rows: installationRows } = await database.query<{ id: string }>(
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerRows[0]?.id],
  );
  const { rows: sessionRows } = await database.query<{ id: string }>(
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationRows[0]?.id, registerRows[0]?.id, installationRows[0]?.id],
  );
  return {
    database,
    locationId: locationRows[0]?.id,
    registerId: registerRows[0]?.id,
    deviceId: installationRows[0]?.id,
    sessionId: sessionRows[0]?.id,
  };
}

describe("the cancelled sales migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded sale as a completed one, with its completion time", async () => {
    const { database, locationId, registerId, deviceId, sessionId } = await databaseBefore();
    await database.query(
      `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, completed_at, total, applied_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', '2026-10-06T11:20:00Z', 4800, now())`,
      [locationId, registerId, deviceId, sessionId],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select state, completed_at, cancelled_at, cancellation_authorized_by, total from sales",
    );
    expect(rows).toEqual([
      {
        state: "COMPLETED",
        completed_at: new Date("2026-10-06T11:20:00Z"),
        cancelled_at: null,
        cancellation_authorized_by: null,
        total: 4800,
      },
    ]);
  });

  it("refuses a sale whose state disagrees with its timestamps", async () => {
    const { database, locationId, registerId, deviceId, sessionId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const insertSale = (state: string, completedAt: string | null, cancelledAt: string | null) =>
      migrated.query(
        `insert into sales
           (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, cancelled_at, total, applied_at)
         values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', $5, $6, $7, 100, now())`,
        [locationId, registerId, deviceId, sessionId, state, completedAt, cancelledAt],
      );

    await expect(insertSale("COMPLETED", "2026-10-06T11:20:00Z", null)).resolves.toBeDefined();
    await expect(insertSale("CANCELLED", null, "2026-10-06T11:20:00Z")).resolves.toBeDefined();
    await expect(insertSale("COMPLETED", null, null)).rejects.toThrow();
    await expect(
      insertSale("COMPLETED", "2026-10-06T11:20:00Z", "2026-10-06T11:21:00Z"),
    ).rejects.toThrow();
    await expect(insertSale("CANCELLED", null, null)).rejects.toThrow();
    await expect(
      insertSale("CANCELLED", "2026-10-06T11:20:00Z", "2026-10-06T11:21:00Z"),
    ).rejects.toThrow();
    await expect(insertSale("VOIDED", "2026-10-06T11:20:00Z", null)).rejects.toThrow();
  });

  it("refuses an authorizer on a sale that was not cancelled", async () => {
    const { database, locationId, registerId, deviceId, sessionId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into sales
           (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, cancellation_authorized_by, total, applied_at)
         values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'COMPLETED', now(), 'user-2', 100, now())`,
        [locationId, registerId, deviceId, sessionId],
      ),
    ).rejects.toThrow();
  });

  it("records a refund of a payment, pending until a person marks it done", async () => {
    const { database, locationId, registerId, deviceId, sessionId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const { rows: saleRows } = await migrated.query<{ id: string }>(
      `insert into sales
         (id, location_id, register_id, device_id, session_id, actor_id, state, cancelled_at, total, applied_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'CANCELLED', now(), 100, now()) returning id`,
      [locationId, registerId, deviceId, sessionId],
    );
    const { rows: paymentRows } = await migrated.query<{ id: string }>(
      `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
       values (gen_random_uuid(), $1, 'TRANSFER', 'NONE', 100, 'APPROVED', now()) returning id`,
      [saleRows[0]?.id],
    );
    const insertRefund = (state: string, doneBy: string | null, doneAt: string | null) =>
      migrated.query(
        `insert into payment_refunds (id, sale_id, payment_id, method, provider, amount, state, occurred_at, done_by, done_at)
         values (gen_random_uuid(), $1, $2, 'TRANSFER', 'NONE', 100, $3, now(), $4, $5)`,
        [saleRows[0]?.id, paymentRows[0]?.id, state, doneBy, doneAt],
      );

    await expect(insertRefund("PENDING", null, null)).resolves.toBeDefined();
    await expect(insertRefund("APPROVED", null, null)).resolves.toBeDefined();
    await expect(insertRefund("APPROVED", "user-3", "2026-10-07T10:00:00Z")).resolves.toBeDefined();
    await expect(insertRefund("PENDING", "user-3", "2026-10-07T10:00:00Z")).rejects.toThrow();
    await expect(insertRefund("APPROVED", "user-3", null)).rejects.toThrow();
    await expect(insertRefund("APPROVED", null, "2026-10-07T10:00:00Z")).rejects.toThrow();
    await expect(insertRefund("REJECTED", null, null)).rejects.toThrow();
  });
});
