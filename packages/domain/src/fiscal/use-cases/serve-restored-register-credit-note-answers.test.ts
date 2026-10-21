import { describe, expect, it } from "vitest";
import type { CreditNoteStanding } from "../model/sale-void-credit-note.js";
import { serveRestoredRegisterCreditNoteAnswers } from "./serve-restored-register-credit-note-answers.js";
import {
  FakeRestoredRegisterCreditNoteAnswers,
  type StoredSaleVoidCreditNote,
} from "./test-support/fake-restored-register-credit-note-answers.js";

const REGISTER = "register-1";
const ANSWERED_AT = new Date("2026-10-07T10:30:00.000Z");

const AUTHORIZED: CreditNoteStanding = {
  kind: "authorized",
  number: 9,
  issuedOn: "2026-10-07",
  requestedAt: new Date("2026-10-07T10:29:00.000Z"),
  authorizationCode: "74123456789012",
  authorizationCodeDueOn: "2026-10-17",
};

function aCreditNote(
  saleId: string,
  standing: CreditNoteStanding,
  overrides: Partial<StoredSaleVoidCreditNote> = {},
): StoredSaleVoidCreditNote {
  return {
    registerId: REGISTER,
    saleId,
    creditNoteId: `credit-note-${saleId}`,
    pointOfSale: 12,
    standing,
    answeredAt: ANSWERED_AT,
    ...overrides,
  };
}

function aCloud(...creditNotes: StoredSaleVoidCreditNote[]) {
  const answers = new FakeRestoredRegisterCreditNoteAnswers();
  answers.creditNotes = creditNotes;
  return answers;
}

describe("serveRestoredRegisterCreditNoteAnswers", () => {
  it("answers with the authorization the tax authority gave a voided sale's credit note", async () => {
    const creditNotes = aCloud(aCreditNote("sale-1", AUTHORIZED));

    const answers = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, saleIds: ["sale-1"] },
    );

    expect(answers).toEqual([
      {
        saleId: "sale-1",
        creditNoteId: "credit-note-sale-1",
        answeredAt: ANSWERED_AT,
        answer: {
          kind: "authorized",
          pointOfSale: 12,
          number: 9,
          issuedOn: "2026-10-07",
          issuedAt: new Date("2026-10-07T10:29:00.000Z"),
          authorizationCode: "74123456789012",
          authorizationCodeDueOn: "2026-10-17",
        },
      },
    ]);
  });

  it("answers with the rejection the tax authority gave", async () => {
    const creditNotes = aCloud(aCreditNote("sale-1", { kind: "rejected" }));

    const answers = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, saleIds: ["sale-1"] },
    );

    expect(answers).toEqual([
      {
        saleId: "sale-1",
        creditNoteId: "credit-note-sale-1",
        answeredAt: ANSWERED_AT,
        answer: { kind: "rejected" },
      },
    ]);
  });

  it("leaves out the credit notes the tax authority has not answered, or answered unclearly", async () => {
    const requested = {
      kind: "requested",
      number: 9,
      issuedOn: "2026-10-07",
      requestedAt: new Date("2026-10-07T10:29:00.000Z"),
    } as const;
    const creditNotes = aCloud(
      aCreditNote("sale-1", { kind: "not_requested" }),
      aCreditNote("sale-2", { ...requested, unclearAnsweredAt: null }),
      aCreditNote("sale-3", { ...requested, unclearAnsweredAt: ANSWERED_AT }),
      aCreditNote("sale-4", AUTHORIZED),
    );

    const answers = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, saleIds: ["sale-1", "sale-2", "sale-3", "sale-4"] },
    );

    expect(answers.map(({ saleId }) => saleId)).toEqual(["sale-4"]);
  });

  it("leaves out an answer that carries no moment it was given", async () => {
    const creditNotes = aCloud(aCreditNote("sale-1", AUTHORIZED, { answeredAt: null }));

    const answers = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, saleIds: ["sale-1"] },
    );

    expect(answers).toEqual([]);
  });

  it("asks for the credit notes of the register and the sales it names only", async () => {
    const creditNotes = aCloud(
      aCreditNote("sale-1", AUTHORIZED),
      aCreditNote("sale-2", AUTHORIZED),
      aCreditNote("sale-3", AUTHORIZED, { registerId: "register-2" }),
    );

    const answers = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, saleIds: ["sale-1", "sale-3"] },
    );

    expect(creditNotes.reads).toEqual([{ registerId: REGISTER, saleIds: ["sale-1", "sale-3"] }]);
    expect(answers.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
  });

  it("asks for nothing when no sale was voided", async () => {
    const creditNotes = aCloud(aCreditNote("sale-1", AUTHORIZED));

    const answers = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, saleIds: [] },
    );

    expect(answers).toEqual([]);
    expect(creditNotes.reads).toEqual([]);
  });
});
