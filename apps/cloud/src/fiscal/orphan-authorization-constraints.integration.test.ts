import { sql as sqlTag } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creditNotes, fiscalTasks } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";

const CREATED_AT = new Date("2026-10-08T01:00:00.000Z");
const ANSWERED_AT = new Date("2026-10-08T01:00:03.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;
let seeded = 0;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("orphan_authorization_constraints");
  sql = postgres(integrationDb.databaseUrl, { max: 1 });
  db = drizzle(sql);
  registerId = await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 7, name: "caja-1" });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function constraintViolatedBy(error: unknown, name: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { constraint_name: constraintName } = current as { constraint_name?: unknown };
    if (constraintName === name) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function insertTask(overrides: Partial<typeof fiscalTasks.$inferInsert>) {
  seeded += 1;
  return db.insert(fiscalTasks).values({
    id: crypto.randomUUID(),
    kind: "external_invoicing",
    registerId,
    pointOfSale: 7,
    documentType: "factura_c",
    number: seeded,
    reason: {},
    state: "open",
    createdAt: CREATED_AT,
    ...overrides,
  });
}

function insertCreditNote(overrides: Partial<typeof creditNotes.$inferInsert>) {
  seeded += 1;
  return db.insert(creditNotes).values({
    id: crypto.randomUUID(),
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale: 7,
    associatedVoucherType: 11,
    associatedPointOfSale: 7,
    reason: "orphan",
    associatedNumber: seeded,
    keptVoucherType: 11,
    keptPointOfSale: 31,
    keptNumber: seeded,
    total: 12_500,
    receiverTaxStatusCode: 5,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

async function aCreditNoteId(): Promise<string> {
  const id = crypto.randomUUID();
  await insertCreditNote({ id });
  return id;
}

function voidedSale(): Partial<typeof creditNotes.$inferInsert> {
  return {
    reason: "sale_void",
    keptVoucherType: null,
    keptPointOfSale: null,
    keptNumber: null,
  };
}

function requested(): Partial<typeof creditNotes.$inferInsert> {
  seeded += 1;
  return { number: 10_000 + seeded, issuedOn: "2026-10-07", requestedAt: CREATED_AT };
}

describe("the fiscal tasks table's constraints on a real Postgres", () => {
  it.each([
    ["an unknown kind", { kind: "reminder" }, "fiscal_tasks_kind_check"],
    ["an unknown document type", { documentType: "factura_b" }, "fiscal_tasks_document_type_check"],
    ["an unknown state", { state: "pending" }, "fiscal_tasks_state_check"],
    ["a closed task with no closing time", { state: "closed" }, "fiscal_tasks_closed_time_check"],
    [
      "an open task with a closing time",
      { state: "open", closedAt: ANSWERED_AT },
      "fiscal_tasks_closed_time_check",
    ],
  ] as const)("rejects %s", async (_name, overrides, constraint) => {
    await expect(insertTask(overrides)).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, constraint),
    );
  });

  it("accepts a closed task with its closing time", async () => {
    await expect(insertTask({ state: "closed", closedAt: ANSWERED_AT })).resolves.toBeDefined();
  });

  it("rejects a second task of the same kind for the same voucher", async () => {
    await insertTask({ number: 5_000 });

    await expect(insertTask({ number: 5_000 })).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "fiscal_tasks_voucher_key"),
    );
  });

  it("keeps a task of each kind for the same voucher", async () => {
    await insertTask({ number: 5_001, documentType: "credit_note_c" });

    await expect(
      insertTask({
        number: 5_001,
        documentType: "credit_note_c",
        kind: "credit_note_rejected",
        creditNoteId: await aCreditNoteId(),
      }),
    ).resolves.toBeDefined();
  });

  it("keeps a rejected credit note task for each credit note rejected at the same voucher", async () => {
    const rejectedAt = (creditNoteId: string) =>
      insertTask({
        number: 5_002,
        documentType: "credit_note_c",
        kind: "credit_note_rejected",
        creditNoteId,
      });
    await rejectedAt(await aCreditNoteId());

    await expect(rejectedAt(await aCreditNoteId())).resolves.toBeDefined();
  });

  it("rejects a second rejected credit note task for the same credit note", async () => {
    const creditNoteId = await aCreditNoteId();
    await insertTask({ documentType: "credit_note_c", kind: "credit_note_rejected", creditNoteId });

    await expect(
      insertTask({ documentType: "credit_note_c", kind: "credit_note_rejected", creditNoteId }),
    ).rejects.toSatisfy((error) => constraintViolatedBy(error, "fiscal_tasks_credit_note_key"));
  });

  it("rejects a rejected credit note task naming no credit note", async () => {
    await expect(
      insertTask({ documentType: "credit_note_c", kind: "credit_note_rejected" }),
    ).rejects.toSatisfy((error) => constraintViolatedBy(error, "fiscal_tasks_credit_note_check"));
  });

  it("rejects an invoicing outside the register task naming a credit note", async () => {
    await expect(insertTask({ creditNoteId: await aCreditNoteId() })).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "fiscal_tasks_credit_note_check"),
    );
  });

  it("rejects a task naming a credit note that does not exist", async () => {
    await expect(
      insertTask({
        documentType: "credit_note_c",
        kind: "credit_note_rejected",
        creditNoteId: crypto.randomUUID(),
      }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "fiscal_tasks_credit_note_id_credit_notes_id_fk"),
    );
  });
});

describe("the credit notes table's constraints on a real Postgres", () => {
  it.each([
    [
      "a number with no issue day nor request time",
      () => ({ number: 1 }),
      "credit_notes_request_check",
    ],
    [
      "an issue day with no number",
      () => ({ issuedOn: "2026-10-07" }),
      "credit_notes_request_check",
    ],
    [
      "an unknown answer",
      () => ({ ...requested(), answerKind: "maybe", answeredAt: ANSWERED_AT }),
      "credit_notes_answer_kind_check",
    ],
    [
      "an answer to a credit note never requested",
      () => ({ answerKind: "unclear", answeredAt: ANSWERED_AT }),
      "credit_notes_answer_request_check",
    ],
    [
      "an answer with no time",
      () => ({ ...requested(), answerKind: "unclear" }),
      "credit_notes_answer_time_check",
    ],
    [
      "an authorization with no code",
      () => ({ ...requested(), answerKind: "authorized", answeredAt: ANSWERED_AT }),
      "credit_notes_authorization_check",
    ],
    [
      "an authorization code on an answer that is no authorization",
      () => ({
        ...requested(),
        answerKind: "unclear",
        answeredAt: ANSWERED_AT,
        authorizationCode: "75123456789099",
        authorizationCodeDueOn: "2026-10-17",
      }),
      "credit_notes_authorization_check",
    ],
    [
      "an authorization code with no due day",
      () => ({
        ...requested(),
        answerKind: "authorized",
        answeredAt: ANSWERED_AT,
        authorizationCode: "75123456789099",
      }),
      "credit_notes_authorization_check",
    ],
    [
      "a rejection with no reasons",
      () => ({ ...requested(), answerKind: "rejected", answeredAt: ANSWERED_AT }),
      "credit_notes_rejection_check",
    ],
    [
      "rejection reasons on an answer that is no rejection",
      () => ({
        ...requested(),
        answerKind: "unclear",
        answeredAt: ANSWERED_AT,
        rejections: [{ code: 10015, message: "invalid receiver" }],
      }),
      "credit_notes_rejection_check",
    ],
  ] as const)("rejects %s", async (_name, overrides, constraint) => {
    await expect(insertCreditNote(overrides())).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, constraint),
    );
  });

  it("rejects a second credit note for the same orphan", async () => {
    await insertCreditNote({ associatedNumber: 7_000 });

    await expect(insertCreditNote({ associatedNumber: 7_000 })).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "credit_notes_corrected_voucher_key"),
    );
  });

  it("rejects a credit note of a voided sale for a voucher an orphan credit note already corrects", async () => {
    await insertCreditNote({ associatedNumber: 7_001 });

    await expect(insertCreditNote({ ...voidedSale(), associatedNumber: 7_001 })).rejects.toSatisfy(
      (error) => constraintViolatedBy(error, "credit_notes_corrected_voucher_key"),
    );
  });

  it("rejects a second credit note of a voided sale for the same voucher", async () => {
    await insertCreditNote({ ...voidedSale(), associatedNumber: 7_002 });

    await expect(insertCreditNote({ ...voidedSale(), associatedNumber: 7_002 })).rejects.toSatisfy(
      (error) => constraintViolatedBy(error, "credit_notes_corrected_voucher_key"),
    );
  });

  it("keeps a credit note for the voucher of each point of sale with the same number", async () => {
    await insertCreditNote({ ...voidedSale(), associatedNumber: 7_003, associatedPointOfSale: 7 });

    await expect(
      insertCreditNote({ ...voidedSale(), associatedNumber: 7_003, associatedPointOfSale: 8 }),
    ).resolves.toBeDefined();
  });

  it("keeps a credit note of a voided sale correcting a voucher of another point of sale than the one issuing it", async () => {
    await expect(
      insertCreditNote({ ...voidedSale(), pointOfSale: 7, associatedPointOfSale: 31 }),
    ).resolves.toBeDefined();
  });

  it("rejects an unknown reason", async () => {
    const id = crypto.randomUUID();
    await insertCreditNote({ ...voidedSale(), id });

    await expect(
      db.execute(sqlTag`update credit_notes set reason = 'refund' where id = ${id}`),
    ).rejects.toSatisfy((error) => constraintViolatedBy(error, "credit_notes_reason_check"));
  });

  it.each([
    [
      "an orphan credit note with no kept voucher",
      () => ({ keptVoucherType: null, keptPointOfSale: null, keptNumber: null }),
      "credit_notes_kept_voucher_check",
    ],
    [
      "a credit note of a voided sale holding a kept voucher",
      () => ({ ...voidedSale(), keptVoucherType: 11, keptPointOfSale: 31, keptNumber: 3 }),
      "credit_notes_kept_voucher_check",
    ],
    [
      "a kept voucher with no point of sale",
      () => ({ keptPointOfSale: null }),
      "credit_notes_kept_voucher_check",
    ],
  ] as const)("rejects %s", async (_name, overrides, constraint) => {
    await expect(insertCreditNote(overrides())).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, constraint),
    );
  });

  it("rejects a second credit note holding the same number at the same point of sale", async () => {
    await insertCreditNote({ number: 8_000, issuedOn: "2026-10-07", requestedAt: CREATED_AT });

    await expect(
      insertCreditNote({ number: 8_000, issuedOn: "2026-10-07", requestedAt: CREATED_AT }),
    ).rejects.toSatisfy((error) => constraintViolatedBy(error, "credit_notes_number_key"));
  });

  it("lets a credit note take the number of a rejected one at the same point of sale", async () => {
    await insertCreditNote({
      number: 8_001,
      issuedOn: "2026-10-07",
      requestedAt: CREATED_AT,
      answerKind: "rejected",
      answeredAt: ANSWERED_AT,
      rejections: [{ code: 10015, message: "invalid receiver" }],
    });

    await expect(
      insertCreditNote({ number: 8_001, issuedOn: "2026-10-07", requestedAt: CREATED_AT }),
    ).resolves.toBeDefined();
  });
});
