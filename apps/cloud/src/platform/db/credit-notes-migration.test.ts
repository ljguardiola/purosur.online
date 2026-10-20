import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_credit_notes");
  const { rows } = await database.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  const registerId = rows[0]?.id as string;
  await database.query(
    `insert into orphan_credit_notes (
       id, register_id, sale_id, point_of_sale, associated_voucher_type, associated_number,
       kept_voucher_type, kept_point_of_sale, kept_number, total, receiver_tax_status_code,
       number, issued_on, requested_at, answer_kind, answered_at, authorization_code,
       authorization_code_due_on, created_at
     ) values (
       '0199b7a0-0000-7000-8000-000000000001', $1, '0199b7a0-0000-7000-8000-000000000002', 7, 11, 41,
       11, 31, 8, 12500, 5, 3, '2026-10-07', '2026-10-07T15:00:00Z', 'authorized',
       '2026-10-07T15:00:02Z', '74123456789055', '2026-10-17', '2026-10-07T14:59:00Z'
     )`,
    [registerId],
  );
  return { database, registerId };
}

describe("the credit notes migration applied over a database that already holds orphan credit notes", {
  timeout: 30_000,
}, () => {
  it("keeps every orphan credit note as a credit note of the orphan reason, correcting a voucher of its own point of sale", async () => {
    const { database, registerId } = await databaseBefore();

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      `select id, register_id, reason, point_of_sale, associated_voucher_type,
              associated_point_of_sale, associated_number, kept_voucher_type, kept_point_of_sale,
              kept_number, number, answer_kind, authorization_code
       from credit_notes`,
    );
    expect(rows).toEqual([
      {
        id: "0199b7a0-0000-7000-8000-000000000001",
        register_id: registerId,
        reason: "orphan",
        point_of_sale: 7,
        associated_voucher_type: 11,
        associated_point_of_sale: 7,
        associated_number: 41,
        kept_voucher_type: 11,
        kept_point_of_sale: 31,
        kept_number: 8,
        number: 3,
        answer_kind: "authorized",
        authorization_code: "74123456789055",
      },
    ]);
  });

  it("refuses a credit note of a voided sale for the voucher a kept orphan credit note already corrects", async () => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into credit_notes (
           id, register_id, sale_id, reason, point_of_sale, associated_voucher_type,
           associated_point_of_sale, associated_number, total, receiver_tax_status_code, created_at
         ) values (
           '0199b7a0-0000-7000-8000-000000000003', $1, '0199b7a0-0000-7000-8000-000000000004',
           'sale_void', 7, 11, 7, 41, 12500, 5, now()
         )`,
        [registerId],
      ),
    ).rejects.toThrow(/credit_notes_corrected_voucher_key/);
  });
});
