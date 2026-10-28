import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eventApplicationUnderTest } from "../sync/test-support/drizzle-event-application.js";
import { voidCreditNoteOfSale } from "./drizzle-void-credit-note.js";
import { insertOfflineCreditNote } from "./test-support/offline-fiscal-document-fixtures.js";
import { insertSaleCreditNote } from "./test-support/sale-credit-notes.js";

const system = eventApplicationUnderTest();

const FORTNIGHT = { start: "2026-10-01", end: "2026-10-15" };
const CORRECTED_INVOICE = { voucherType: 11, pointOfSale: 31, number: 8 };

let registerId: string;

beforeEach(async () => {
  ({ registerId } = await system.enrollInstallation());
});

function insertReturnCreditNote(saleId: string) {
  return insertSaleCreditNote(system.db, registerId, saleId, {
    reason: "sale_return",
    returnId: randomUUID(),
    issueOn: "2026-10-07",
  });
}

describe("the void credit note of a sale", () => {
  it("is the credit note the cloud was asked for to void the sale, not a return's", async () => {
    const saleId = randomUUID();
    await insertReturnCreditNote(saleId);
    const voidCreditNote = await insertSaleCreditNote(system.db, registerId, saleId);

    expect(await voidCreditNoteOfSale(system.db, saleId)).toBe(voidCreditNote);
  });

  it("is the credit note issued offline for the sale when the cloud was never asked for one", async () => {
    const saleId = randomUUID();
    const voidCreditNote = randomUUID();
    await insertOfflineCreditNote(system.db, {
      registerId,
      pointOfSale: 8,
      fortnight: FORTNIGHT,
      number: 3,
      corrects: CORRECTED_INVOICE,
      saleId,
      creditNoteId: voidCreditNote,
    });

    expect(await voidCreditNoteOfSale(system.db, saleId)).toBe(voidCreditNote);
  });

  it("is none for a sale with only a return's credit note, or with none", async () => {
    const returned = randomUUID();
    await insertReturnCreditNote(returned);

    expect(await voidCreditNoteOfSale(system.db, returned)).toBeNull();
    expect(await voidCreditNoteOfSale(system.db, randomUUID())).toBeNull();
  });

  it("is never another sale's", async () => {
    await insertSaleCreditNote(system.db, registerId, randomUUID());
    await insertOfflineCreditNote(system.db, {
      registerId,
      pointOfSale: 8,
      fortnight: FORTNIGHT,
      number: 4,
      corrects: CORRECTED_INVOICE,
    });

    expect(await voidCreditNoteOfSale(system.db, randomUUID())).toBeNull();
  });
});
