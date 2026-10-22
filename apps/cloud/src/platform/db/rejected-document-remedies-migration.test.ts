import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function migratedDatabase() {
  const database = await databaseBeforeMigration("_rejected_document_remedies");
  await database.query(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
  );
  await database.query(
    `insert into users (first_name, email, location_id)
     select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
  );
  await database.query(
    `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
     select 7, registers.id, 'offline', users.id from registers, users`,
  );
  return database.applyMigration();
}

const insertRemedy = (kind: string, correction: string) =>
  `insert into rejected_document_remedies
     (point_of_sale_number, fortnight_start, document_type, number, kind, correction, recorded_at)
   values (7, '2026-10-01', 'factura_c', 3, '${kind}', ${correction}, '2026-10-16T12:00:00Z')`;

describe("the rejected document remedies migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("accepts a credit note issued for a rejected document", async () => {
    const client = await migratedDatabase();

    await client.query(
      `insert into credit_notes (
         id, register_id, sale_id, reason, point_of_sale, associated_voucher_type,
         associated_point_of_sale, associated_number, total, receiver_tax_status_code, created_at
       ) select
         '0199b7a0-0000-7000-8000-000000000003', registers.id,
         '0199b7a0-0000-7000-8000-000000000004', 'rejected_document', 4, 11, 7, 3, 12500, 5, now()
       from registers`,
    );

    const { rows } = await client.query(`select reason from credit_notes`);
    expect(rows).toEqual([{ reason: "rejected_document" }]);
  });

  it("still refuses a credit note for a reason the domain does not know", async () => {
    const client = await migratedDatabase();

    await expect(
      client.query(
        `insert into credit_notes (
           id, register_id, sale_id, reason, point_of_sale, associated_voucher_type,
           associated_point_of_sale, associated_number, total, receiver_tax_status_code, created_at
         ) select
           '0199b7a0-0000-7000-8000-000000000003', registers.id,
           '0199b7a0-0000-7000-8000-000000000004', 'refund', 4, 11, 7, 3, 12500, 5, now()
         from registers`,
      ),
    ).rejects.toThrow(/credit_notes_reason_check/);
  });

  it("records a remedy that reports the document again without a correction, and one that corrects it with one", async () => {
    const client = await migratedDatabase();

    await client.query(insertRemedy("report", "null"));
    await client.query(insertRemedy("printed", `'{"issuedOn":"2026-10-02"}'::jsonb`));

    const { rows } = await client.query(
      `select kind, correction from rejected_document_remedies order by kind desc`,
    );
    expect(rows).toEqual([
      { kind: "report", correction: null },
      { kind: "printed", correction: { issuedOn: "2026-10-02" } },
    ]);
  });

  it("records the instant of the rejection a remedy remedies, and none for a rejection never attempted", async () => {
    const client = await migratedDatabase();

    await client.query(
      `insert into rejected_document_remedies
         (point_of_sale_number, fortnight_start, document_type, number, kind, rejected_at, recorded_at)
       values
         (7, '2026-10-01', 'factura_c', 3, 'report', '2026-10-16T11:00:00Z', '2026-10-16T12:00:00Z'),
         (7, '2026-10-01', 'factura_c', 4, 'report', null, '2026-10-16T12:00:00Z')`,
    );

    const { rows } = await client.query(
      `select number, rejected_at from rejected_document_remedies order by number`,
    );
    expect(rows).toEqual([
      { number: 3, rejected_at: new Date("2026-10-16T11:00:00.000Z") },
      { number: 4, rejected_at: null },
    ]);
  });

  it.each([
    [
      "a corrected remedy without its correction",
      insertRemedy("printed", "null"),
      /correction_check/,
    ],
    [
      "a report remedy carrying a correction",
      insertRemedy("report", `'{"total":1}'::jsonb`),
      /correction_check/,
    ],
    ["a remedy of an unknown kind", insertRemedy("discard", "null"), /kind_check/],
  ])("refuses %s", async (_case, statement, constraint) => {
    const client = await migratedDatabase();

    await expect(client.query(statement)).rejects.toThrow(constraint);
  });
});
