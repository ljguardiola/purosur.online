import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCompletedSale, applyVoidedSale } from "../sales/test-support/applied-sales.js";
import { eventApplicationUnderTest } from "../sync/test-support/drizzle-event-application.js";
import { voidCreditNoteOfSale } from "./drizzle-void-credit-note.js";
import { insertOfflineCreditNote } from "./test-support/offline-fiscal-document-fixtures.js";
import { insertSaleCreditNote } from "./test-support/sale-credit-notes.js";

const system = eventApplicationUnderTest();

const FORTNIGHT = { start: "2026-10-01", end: "2026-10-15" };
const CORRECTED_INVOICE = { voucherType: 11, pointOfSale: 31, number: 8 };

const COMPLETED_AT = new Date("2026-10-06T11:20:00.000Z");

let registerId: string;
let deviceId: string;

beforeEach(async () => {
  ({ registerId, deviceId } = await system.enrollInstallation());
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

  it("is the credit note issued offline for the voided sale when the cloud was never asked for one", async () => {
    const { id: saleId } = await applyVoidedSale(system.db, {
      deviceId,
      completedAt: COMPLETED_AT,
      voidedAt: new Date("2026-10-06T15:00:00.000Z"),
      completed: {},
    });
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

  it("is none for a sale that was not voided, whose only offline credit note is a return's", async () => {
    const saleId = await applyCompletedSale(system.db, {
      deviceId,
      completedAt: COMPLETED_AT,
      total: 4800,
    });
    await insertOfflineCreditNote(system.db, {
      registerId,
      pointOfSale: 8,
      fortnight: FORTNIGHT,
      number: 3,
      corrects: CORRECTED_INVOICE,
      saleId,
    });

    expect(await voidCreditNoteOfSale(system.db, saleId)).toBeNull();
  });

  it("is none for a sale that was not voided, whose offline credit notes are its returns'", async () => {
    const saleId = await applyCompletedSale(system.db, {
      deviceId,
      completedAt: COMPLETED_AT,
      total: 4800,
    });
    for (const number of [3, 4]) {
      await insertOfflineCreditNote(system.db, {
        registerId,
        pointOfSale: 8,
        fortnight: FORTNIGHT,
        number,
        corrects: CORRECTED_INVOICE,
        saleId,
      });
    }

    expect(await voidCreditNoteOfSale(system.db, saleId)).toBeNull();
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
