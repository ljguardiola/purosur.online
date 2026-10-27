import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const VOID_NOTE_ID = "0199b7a0-0000-7000-8000-0000000000a1";
const ORPHAN_NOTE_ID = "0199b7a0-0000-7000-8000-0000000000a2";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_return_credit_notes");
  const { rows: locations } = await database.query<{ id: string }>(
    "select id from locations limit 1",
  );
  const { rows: registers } = await database.query<{ id: string }>(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locations[0]?.id],
  );
  const registerId = registers[0]?.id as string;
  await database.query(
    `insert into credit_notes
       (id, register_id, sale_id, reason, point_of_sale, associated_voucher_type, associated_point_of_sale,
        associated_number, total, receiver_tax_status_code, number, issued_on, requested_at, answer_kind,
        answered_at, authorization_code, authorization_code_due_on, created_at)
     values ($1, $2, gen_random_uuid(), 'sale_void', 7, 11, 31, 42, 12500, 5, 3, '2026-10-07',
        '2026-10-07T10:29:00Z', 'authorized', '2026-10-07T10:30:00Z', '74123456789012', '2026-10-17',
        '2026-10-07T10:00:00Z')`,
    [VOID_NOTE_ID, registerId],
  );
  await database.query(
    `insert into credit_notes
       (id, register_id, sale_id, reason, point_of_sale, associated_voucher_type, associated_point_of_sale,
        associated_number, kept_voucher_type, kept_point_of_sale, kept_number, total,
        receiver_tax_status_code, number, issued_on, requested_at, answer_kind, answered_at, rejections, created_at)
     values ($1, $2, gen_random_uuid(), 'orphan', 7, 11, 31, 50, 11, 31, 51, 900, 5, 4, '2026-10-07',
        '2026-10-07T10:29:00Z', 'rejected', '2026-10-07T10:30:00Z', '[]', '2026-10-07T10:00:00Z')`,
    [ORPHAN_NOTE_ID, registerId],
  );
  await database.query(
    `insert into fiscal_tasks (id, kind, register_id, point_of_sale, document_type, number, credit_note_id, reason, state, created_at)
     values (gen_random_uuid(), 'credit_note_rejected', $1, 7, 'credit_note_c', 4, $2, '{"rejections":[]}', 'open', now())`,
    [registerId, ORPHAN_NOTE_ID],
  );
  return { database, registerId };
}

async function migratedDatabase() {
  const before = await databaseBefore();
  const migrated = await before.database.applyMigration();
  const insertNote = (columns: Record<string, string | number | null>) => {
    const values = {
      id: crypto.randomUUID(),
      register_id: before.registerId,
      sale_id: crypto.randomUUID(),
      reason: "sale_return",
      point_of_sale: 7,
      associated_voucher_type: 11,
      associated_point_of_sale: 31,
      associated_number: 42,
      total: 3000,
      receiver_tax_status_code: 5,
      created_at: "2026-10-08T10:00:00Z",
      ...columns,
    };
    const names = Object.keys(values);
    return migrated.query(
      `insert into credit_notes (${names.join(", ")}) values (${names.map((_, index) => `$${index + 1}`).join(", ")})`,
      Object.values(values),
    );
  };
  return { ...before, migrated, insertNote };
}

describe("the return credit notes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the credit notes of voided sales and of orphans as they were, and the task of a rejection", async () => {
    const { database } = await databaseBefore();

    const migrated = await database.applyMigration();

    expect(
      (
        await migrated.query(
          `select id, reason, associated_number, total, number, answer_kind, authorization_code,
                  return_id, issue_on
           from credit_notes order by id`,
        )
      ).rows,
    ).toEqual([
      {
        id: VOID_NOTE_ID,
        reason: "sale_void",
        associated_number: 42,
        total: 12500,
        number: 3,
        answer_kind: "authorized",
        authorization_code: "74123456789012",
        return_id: null,
        issue_on: null,
      },
      {
        id: ORPHAN_NOTE_ID,
        reason: "orphan",
        associated_number: 50,
        total: 900,
        number: 4,
        answer_kind: "rejected",
        authorization_code: null,
        return_id: null,
        issue_on: null,
      },
    ]);
    expect(
      (await migrated.query("select kind, number, credit_note_id from fiscal_tasks")).rows,
    ).toEqual([{ kind: "credit_note_rejected", number: 4, credit_note_id: ORPHAN_NOTE_ID }]);
  });

  describe("the credit notes of one invoice", () => {
    it("are no longer limited to one", async () => {
      const { migrated, insertNote } = await migratedDatabase();

      await insertNote({ associated_number: 42, total: 5000 });
      await insertNote({ associated_number: 42, total: 5000 });

      expect(
        (
          await migrated.query(
            "select count(*)::int as count from credit_notes where associated_number = 42",
          )
        ).rows,
      ).toEqual([{ count: 3 }]);
    });
  });

  describe("the credit note of a return", () => {
    it("holds the return it answers and the day it is issued on", async () => {
      const { migrated, insertNote } = await migratedDatabase();
      const returnId = crypto.randomUUID();

      await insertNote({ return_id: returnId, issue_on: "2026-10-05" });

      expect(
        (
          await migrated.query(
            "select reason, return_id, issue_on from credit_notes where reason = 'sale_return'",
          )
        ).rows,
      ).toEqual([{ reason: "sale_return", return_id: returnId, issue_on: "2026-10-05" }]);
    });

    it.each([
      ["without its return", { issue_on: "2026-10-05" }],
      ["without its day", { return_id: "0199b7a0-0000-7000-8000-0000000000b1" }],
    ])("is refused %s", async (_description, columns) => {
      const { insertNote } = await migratedDatabase();

      await expect(insertNote(columns)).rejects.toThrow(/credit_notes_return_check/);
    });

    it.each([
      ["a voided sale", "sale_void"],
      ["an orphan", "orphan"],
    ])("is refused for %s that names a return", async (_description, reason) => {
      const { insertNote } = await migratedDatabase();

      await expect(
        insertNote({
          reason,
          return_id: "0199b7a0-0000-7000-8000-0000000000b2",
          issue_on: "2026-10-05",
          ...(reason === "orphan"
            ? { kept_voucher_type: 11, kept_point_of_sale: 31, kept_number: 51 }
            : {}),
        }),
      ).rejects.toThrow(/credit_notes_return_check/);
    });

    it("still refuses a reason that is not listed", async () => {
      const { insertNote } = await migratedDatabase();

      await expect(insertNote({ reason: "gift" })).rejects.toThrow(/credit_notes_reason_check/);
    });
  });

  describe("a credit note a person must regularize", () => {
    it("holds that answer without a number, and the task for a person without a number", async () => {
      const { migrated, insertNote, registerId } = await migratedDatabase();
      const returnId = crypto.randomUUID();
      const id = crypto.randomUUID();
      await insertNote({
        id,
        return_id: returnId,
        issue_on: "2026-10-05",
        answer_kind: "regularization_required",
        answered_at: "2026-10-08T10:01:00Z",
      });

      await migrated.query(
        `insert into fiscal_tasks (id, kind, register_id, point_of_sale, document_type, number, credit_note_id, reason, state, created_at)
         values (gen_random_uuid(), 'credit_note_rejected', $1, 7, 'credit_note_c', null, $2, '{"rejections":[]}', 'open', now())`,
        [registerId, id],
      );

      expect(
        (await migrated.query("select answer_kind, number from credit_notes where id = $1", [id]))
          .rows,
      ).toEqual([{ answer_kind: "regularization_required", number: null }]);
      expect(
        (await migrated.query("select number from fiscal_tasks where credit_note_id = $1", [id]))
          .rows,
      ).toEqual([{ number: null }]);
    });

    it("still refuses an answer without a number other than that one", async () => {
      const { insertNote } = await migratedDatabase();

      await expect(
        insertNote({
          reason: "sale_void",
          answer_kind: "rejected",
          answered_at: "2026-10-08T10:01:00Z",
          rejections: "[]",
        }),
      ).rejects.toThrow(/credit_notes_answer_request_check/);
    });

    it("still refuses an answer that is not listed", async () => {
      const { insertNote } = await migratedDatabase();

      await expect(
        insertNote({
          reason: "sale_void",
          answer_kind: "lost",
          answered_at: "2026-10-08T10:01:00Z",
        }),
      ).rejects.toThrow(/credit_notes_answer_kind_check/);
    });

    it("still refuses a task without a number for an external invoicing", async () => {
      const { migrated, registerId } = await migratedDatabase();

      await expect(
        migrated.query(
          `insert into fiscal_tasks (id, kind, register_id, point_of_sale, document_type, number, reason, state, created_at)
           values (gen_random_uuid(), 'external_invoicing', $1, 7, 'factura_c', null, '{}', 'open', now())`,
          [registerId],
        ),
      ).rejects.toThrow(/fiscal_tasks_voucher_check/);
    });
  });
});
