import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  insertBranch,
  insertRegister,
} from "../register/test-support/restored-register-installations.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRestoredRegisterCreditNoteAnswers } from "./drizzle-restored-register-credit-note-answers.js";
import {
  ANSWERED_AT,
  anAuthorizedAnswer,
  anUnclearAnswer,
  aRejectedAnswer,
  insertSaleVoidCreditNote,
  REQUESTED_AT,
} from "./test-support/sale-void-credit-notes.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let answers: DrizzleRestoredRegisterCreditNoteAnswers<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("restored_register_credit_note_answers");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  answers = new DrizzleRestoredRegisterCreditNoteAnswers(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function aRegister(): Promise<string> {
  return insertRegister(db, await insertBranch(db));
}

describe("the sale void credit notes of a restored register on a real Postgres", () => {
  it("holds an authorized credit note with its authorization, the point of sale and when it was answered", async () => {
    const registerId = await aRegister();
    const saleId = crypto.randomUUID();
    const creditNoteId = await insertSaleVoidCreditNote(
      db,
      registerId,
      saleId,
      anAuthorizedAnswer(9),
    );

    const found = await answers.saleVoidCreditNotesOf(registerId, [saleId]);

    expect(found).toEqual([
      {
        saleId,
        creditNoteId,
        pointOfSale: 7,
        answeredAt: ANSWERED_AT,
        standing: {
          kind: "authorized",
          number: 9,
          issuedOn: "2026-10-07",
          requestedAt: REQUESTED_AT,
          authorizationCode: "74123456789012",
          authorizationCodeDueOn: "2026-10-17",
        },
      },
    ]);
  });

  it("holds a rejected credit note", async () => {
    const registerId = await aRegister();
    const saleId = crypto.randomUUID();
    await insertSaleVoidCreditNote(db, registerId, saleId, aRejectedAnswer());

    const found = await answers.saleVoidCreditNotesOf(registerId, [saleId]);

    expect(found).toMatchObject([
      { saleId, standing: { kind: "rejected" }, answeredAt: ANSWERED_AT },
    ]);
  });

  it("holds the credit notes still waiting for the tax authority, or answered unclearly, as such", async () => {
    const registerId = await aRegister();
    const unrequested = crypto.randomUUID();
    const requested = crypto.randomUUID();
    const unclear = crypto.randomUUID();
    await insertSaleVoidCreditNote(db, registerId, unrequested);
    await insertSaleVoidCreditNote(db, registerId, requested, {
      number: 11,
      issuedOn: "2026-10-07",
      requestedAt: REQUESTED_AT,
    });
    await insertSaleVoidCreditNote(db, registerId, unclear, anUnclearAnswer());

    const found = await answers.saleVoidCreditNotesOf(registerId, [
      unrequested,
      requested,
      unclear,
    ]);

    expect(
      Object.fromEntries(found.map(({ saleId, standing }) => [saleId, standing.kind])),
    ).toEqual({
      [unrequested]: "not_requested",
      [requested]: "requested",
      [unclear]: "requested",
    });
  });

  it("never holds the credit notes of another register, even for the same sale", async () => {
    const registerId = await aRegister();
    const otherRegisterId = await aRegister();
    const saleId = crypto.randomUUID();
    await insertSaleVoidCreditNote(db, otherRegisterId, saleId, anAuthorizedAnswer());

    const found = await answers.saleVoidCreditNotesOf(registerId, [saleId]);

    expect(found).toEqual([]);
  });

  it("holds only the credit notes of the sales it is asked about", async () => {
    const registerId = await aRegister();
    const asked = crypto.randomUUID();
    const notAsked = crypto.randomUUID();
    await insertSaleVoidCreditNote(db, registerId, asked, anAuthorizedAnswer());
    await insertSaleVoidCreditNote(db, registerId, notAsked, anAuthorizedAnswer());

    const found = await answers.saleVoidCreditNotesOf(registerId, [asked]);

    expect(found.map(({ saleId }) => saleId)).toEqual([asked]);
  });

  it("does not hold the credit notes that regularize an orphan authorization", async () => {
    const registerId = await aRegister();
    const saleId = crypto.randomUUID();
    await insertSaleVoidCreditNote(db, registerId, saleId, {
      ...anAuthorizedAnswer(),
      reason: "orphan",
      keptVoucherType: 11,
      keptPointOfSale: 31,
      keptNumber: 5000,
    });

    const found = await answers.saleVoidCreditNotesOf(registerId, [saleId]);

    expect(found).toEqual([]);
  });
});
