import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

const DEFERRED_SALE_ID = "0199b7a0-0000-7000-8000-0000000000d1";
const OTHER_DEFERRED_SALE_ID = "0199b7a0-0000-7000-8000-0000000000d2";

async function databaseHoldingTasksOfBothKinds() {
  const database = await databaseBeforeMigration("_deferred_sale_records");
  await database.query(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
  );
  await database.query(
    `insert into credit_notes (
       id, register_id, sale_id, reason, point_of_sale, associated_voucher_type,
       associated_point_of_sale, associated_number, total, receiver_tax_status_code, created_at
     ) select
       '0199b7a0-0000-7000-8000-0000000000c1', registers.id,
       '0199b7a0-0000-7000-8000-0000000000c2', 'orphan', 7, 11, 7, 3, 12500, 5, now()
     from registers`,
  );
  await database.query(
    `insert into fiscal_tasks (id, kind, register_id, point_of_sale, document_type, number, reason, created_at)
     select '0199b7a0-0000-7000-8000-0000000000a1', 'external_invoicing', registers.id, 7,
            'factura_c', 3, '{"total": 12500}', '2026-10-06T15:00:00Z'
     from registers`,
  );
  await database.query(
    `insert into fiscal_tasks
       (id, kind, register_id, point_of_sale, document_type, number, credit_note_id, reason, created_at)
     select '0199b7a0-0000-7000-8000-0000000000a2', 'credit_note_rejected', registers.id, 7,
            'credit_note_c', 4, '0199b7a0-0000-7000-8000-0000000000c1', '{"rejections": []}',
            '2026-10-06T16:00:00Z'
     from registers`,
  );
  return database.applyMigration();
}

async function migratedDatabase() {
  return (await databaseBeforeMigration("_deferred_sale_records")).applyMigration();
}

function insertDeferredSale(
  database: SqlOnlyDatabase,
  { id = DEFERRED_SALE_ID, state, times = "" }: { id?: string; state: string; times?: string },
) {
  const columns = times === "" ? "" : `, ${times.split("=")[0]?.trim()}`;
  const values = times === "" ? "" : `, ${times.split("=")[1]?.trim()}`;
  return database.query(
    `insert into deferred_sales
       (id, sale_id, register_id, location_id, occurred_at, total, reason, short_code, routed_at, state${columns})
     select '${id}', gen_random_uuid(), registers.id, registers.location_id,
            '2026-10-01T15:00:00Z', 4800, 'no_connectivity', 'ABC123', '2026-10-01T15:00:05Z',
            '${state}'${values}
     from registers`,
  );
}

function insertDeferredTask(database: SqlOnlyDatabase, extra: { columns?: string; values?: string }) {
  return database.query(
    `insert into fiscal_tasks (id, kind, register_id, reason, created_at${extra.columns ?? ""})
     select gen_random_uuid(), 'deferred_sale_expired', registers.id, '{}', now()${extra.values ?? ""}
     from registers`,
  );
}

describe("the deferred sale records migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the tasks of both earlier kinds with their voucher", async () => {
    const migrated = await databaseHoldingTasksOfBothKinds();

    const { rows } = await migrated.query(
      `select kind, point_of_sale, document_type, number, deferred_sale_id
       from fiscal_tasks order by number`,
    );

    expect(rows).toEqual([
      {
        kind: "external_invoicing",
        point_of_sale: 7,
        document_type: "factura_c",
        number: 3,
        deferred_sale_id: null,
      },
      {
        kind: "credit_note_rejected",
        point_of_sale: 7,
        document_type: "credit_note_c",
        number: 4,
        deferred_sale_id: null,
      },
    ]);
  });

  it("accepts the regularization task of an expired deferred sale, which names no voucher", async () => {
    const migrated = await migratedDatabase();
    await insertDeferredSale(migrated, {
      state: "expired",
      times: "expired_at = '2026-10-10T03:00:00Z'",
    });

    await insertDeferredTask(migrated, {
      columns: ", deferred_sale_id",
      values: `, '${DEFERRED_SALE_ID}'`,
    });

    const { rows } = await migrated.query(
      `select kind, point_of_sale, document_type, number from fiscal_tasks`,
    );
    expect(rows).toEqual([
      { kind: "deferred_sale_expired", point_of_sale: null, document_type: null, number: null },
    ]);
  });

  it("refuses a regularization task that names no deferred sale", async () => {
    const migrated = await migratedDatabase();

    await expect(insertDeferredTask(migrated, {})).rejects.toThrow();
  });

  it("refuses a regularization task that names a voucher", async () => {
    const migrated = await migratedDatabase();
    await insertDeferredSale(migrated, {
      state: "expired",
      times: "expired_at = '2026-10-10T03:00:00Z'",
    });

    await expect(
      insertDeferredTask(migrated, {
        columns: ", deferred_sale_id, point_of_sale, document_type, number",
        values: `, '${DEFERRED_SALE_ID}', 7, 'factura_c', 9`,
      }),
    ).rejects.toThrow();
  });

  it("refuses a second regularization task for the same deferred sale", async () => {
    const migrated = await migratedDatabase();
    await insertDeferredSale(migrated, {
      state: "expired",
      times: "expired_at = '2026-10-10T03:00:00Z'",
    });
    const named = { columns: ", deferred_sale_id", values: `, '${DEFERRED_SALE_ID}'` };
    await insertDeferredTask(migrated, named);

    await expect(insertDeferredTask(migrated, named)).rejects.toThrow();
  });

  it("refuses an invoicing task outside the register that names no voucher number", async () => {
    const migrated = await migratedDatabase();

    await expect(
      migrated.query(
        `insert into fiscal_tasks (id, kind, register_id, point_of_sale, document_type, reason, created_at)
         select gen_random_uuid(), 'external_invoicing', registers.id, 7, 'factura_c', '{}', now()
         from registers`,
      ),
    ).rejects.toThrow();
  });

  it("refuses an invoicing task outside the register that names a deferred sale", async () => {
    const migrated = await migratedDatabase();
    await insertDeferredSale(migrated, {
      state: "expired",
      times: "expired_at = '2026-10-10T03:00:00Z'",
    });

    await expect(
      migrated.query(
        `insert into fiscal_tasks
           (id, kind, register_id, point_of_sale, document_type, number, deferred_sale_id, reason, created_at)
         select gen_random_uuid(), 'external_invoicing', registers.id, 7, 'factura_c', 1,
                '${DEFERRED_SALE_ID}', '{}', now()
         from registers`,
      ),
    ).rejects.toThrow();
  });

  it("still refuses a voucher of a document type the domain does not know", async () => {
    const migrated = await migratedDatabase();

    await expect(
      migrated.query(
        `insert into fiscal_tasks (id, kind, register_id, point_of_sale, document_type, number, reason, created_at)
         select gen_random_uuid(), 'external_invoicing', registers.id, 7, 'factura_b', 1, '{}', now()
         from registers`,
      ),
    ).rejects.toThrow();
  });
});

describe("the deferred sales table", { timeout: 30_000 }, () => {
  it.each([
    ["pending", ""],
    ["satisfied", "satisfied_at = '2026-10-02T12:00:00Z'"],
    ["cancelled", "cancelled_at = '2026-10-02T12:00:00Z'"],
    ["expired", "expired_at = '2026-10-10T03:00:00Z'"],
  ])("accepts a %s deferred sale", async (state, times) => {
    const migrated = await migratedDatabase();

    await insertDeferredSale(migrated, { state, times });

    const { rows } = await migrated.query(`select state from deferred_sales`);
    expect(rows).toEqual([{ state }]);
  });

  it("accepts a deferred sale satisfied after it expired", async () => {
    const migrated = await migratedDatabase();

    await migrated.query(
      `insert into deferred_sales
         (id, sale_id, register_id, location_id, occurred_at, total, reason, short_code, routed_at,
          state, satisfied_at, expired_at)
       select '${DEFERRED_SALE_ID}', gen_random_uuid(), registers.id, registers.location_id,
              '2026-10-01T15:00:00Z', 4800, 'no_connectivity', 'ABC123', '2026-10-01T15:00:05Z',
              'satisfied', '2026-10-12T12:00:00Z', '2026-10-10T03:00:00Z'
       from registers`,
    );

    const { rows } = await migrated.query(`select state from deferred_sales`);
    expect(rows).toEqual([{ state: "satisfied" }]);
  });

  it.each([
    ["an unknown state", "dismissed", ""],
    ["a satisfied one without its satisfaction time", "satisfied", ""],
    ["a cancelled one without its cancellation time", "cancelled", ""],
    ["an expired one without its expiry time", "expired", ""],
    ["a pending one with a satisfaction time", "pending", "satisfied_at = '2026-10-02T12:00:00Z'"],
    ["a pending one with an expiry time", "pending", "expired_at = '2026-10-10T03:00:00Z'"],
    ["an expired one with a cancellation time", "expired", "cancelled_at = '2026-10-02T12:00:00Z'"],
  ])("refuses %s", async (_name, state, times) => {
    const migrated = await migratedDatabase();
    await migrated.query(`select 1`);

    await expect(insertDeferredSale(migrated, { state, times })).rejects.toThrow();
  });

  it("refuses a second record with the same id", async () => {
    const migrated = await migratedDatabase();
    await insertDeferredSale(migrated, { state: "pending" });

    await expect(insertDeferredSale(migrated, { state: "pending" })).rejects.toThrow();
  });

  it("keeps two deferred sales apart", async () => {
    const migrated = await migratedDatabase();
    await insertDeferredSale(migrated, { state: "pending" });

    await insertDeferredSale(migrated, { id: OTHER_DEFERRED_SALE_ID, state: "pending" });

    const { rows } = await migrated.query(`select count(*)::int as count from deferred_sales`);
    expect(rows).toEqual([{ count: 2 }]);
  });
});
