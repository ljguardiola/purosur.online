import { describe, expect, it } from "vitest";
import type { CreditNoteStanding } from "../model/sale-void-credit-note.js";
import { serveRestoredRegisterCreditNoteAnswers } from "./serve-restored-register-credit-note-answers.js";
import {
  FakeRestoredRegisterCreditNoteAnswers,
  type StoredAlreadyCreditedRefusal,
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

const REFUSED_AT = new Date("2026-10-07T10:35:00.000Z");

function aCreditNote(
  creditNoteId: string,
  standing: CreditNoteStanding,
  overrides: Partial<StoredSaleVoidCreditNote> = {},
): StoredSaleVoidCreditNote {
  return {
    registerId: REGISTER,
    creditNoteId,
    pointOfSale: 12,
    standing,
    answeredAt: ANSWERED_AT,
    ...overrides,
  };
}

function aCloud(
  creditNotes: StoredSaleVoidCreditNote[],
  refusals: StoredAlreadyCreditedRefusal[] = [],
) {
  const answers = new FakeRestoredRegisterCreditNoteAnswers();
  answers.creditNotes = creditNotes;
  answers.refusals = refusals;
  return answers;
}

describe("serveRestoredRegisterCreditNoteAnswers", () => {
  it("answers with the authorization the tax authority gave a voided sale's credit note", async () => {
    const creditNotes = aCloud([aCreditNote("note-1", AUTHORIZED)]);

    const served = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, creditNoteIds: ["note-1"] },
    );

    expect(served).toEqual({
      answers: [
        {
          creditNoteId: "note-1",
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
      ],
      unrequestedCreditNoteIds: [],
    });
  });

  it("answers with the rejection the tax authority gave", async () => {
    const creditNotes = aCloud([aCreditNote("note-1", { kind: "rejected" })]);

    const served = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, creditNoteIds: ["note-1"] },
    );

    expect(served.answers).toEqual([
      { creditNoteId: "note-1", answeredAt: ANSWERED_AT, answer: { kind: "rejected" } },
    ]);
  });

  it("answers already credited, when the time of the kept refusal, for a credit note the cloud refused", async () => {
    const creditNotes = aCloud(
      [],
      [{ registerId: REGISTER, creditNoteId: "note-1", refusedAt: REFUSED_AT }],
    );

    const served = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, creditNoteIds: ["note-1"] },
    );

    expect(served).toEqual({
      answers: [
        { creditNoteId: "note-1", answeredAt: REFUSED_AT, answer: { kind: "already_credited" } },
      ],
      unrequestedCreditNoteIds: [],
    });
  });

  it("names the credit notes the cloud never recorded nor refused as unrequested", async () => {
    const creditNotes = aCloud([aCreditNote("note-2", AUTHORIZED)]);

    const served = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, creditNoteIds: ["note-1", "note-2", "note-3"] },
    );

    expect(served.answers.map(({ creditNoteId }) => creditNoteId)).toEqual(["note-2"]);
    expect(served.unrequestedCreditNoteIds).toEqual(["note-1", "note-3"]);
  });

  it("neither answers nor names as unrequested the credit notes the tax authority has not answered, or answered unclearly", async () => {
    const requested = {
      kind: "requested",
      number: 9,
      issuedOn: "2026-10-07",
      requestedAt: new Date("2026-10-07T10:29:00.000Z"),
    } as const;
    const creditNotes = aCloud([
      aCreditNote("note-1", { kind: "not_requested" }),
      aCreditNote("note-2", { ...requested, unclearAnsweredAt: null }),
      aCreditNote("note-3", { ...requested, unclearAnsweredAt: ANSWERED_AT }),
      aCreditNote("note-4", AUTHORIZED),
    ]);

    const served = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, creditNoteIds: ["note-1", "note-2", "note-3", "note-4"] },
    );

    expect(served.answers.map(({ creditNoteId }) => creditNoteId)).toEqual(["note-4"]);
    expect(served.unrequestedCreditNoteIds).toEqual([]);
  });

  it("leaves out, without calling it unrequested, an answer that carries no moment it was given", async () => {
    const creditNotes = aCloud([aCreditNote("note-1", AUTHORIZED, { answeredAt: null })]);

    const served = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, creditNoteIds: ["note-1"] },
    );

    expect(served).toEqual({ answers: [], unrequestedCreditNoteIds: [] });
  });

  it("asks for the credit notes of the register and the ids it names only", async () => {
    const creditNotes = aCloud(
      [
        aCreditNote("note-1", AUTHORIZED),
        aCreditNote("note-2", AUTHORIZED),
        aCreditNote("note-3", AUTHORIZED, { registerId: "register-2" }),
      ],
      [{ registerId: "register-2", creditNoteId: "note-4", refusedAt: REFUSED_AT }],
    );

    const served = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, creditNoteIds: ["note-1", "note-3", "note-4"] },
    );

    expect(creditNotes.reads).toEqual([
      { registerId: REGISTER, creditNoteIds: ["note-1", "note-3", "note-4"] },
    ]);
    expect(served.answers.map(({ creditNoteId }) => creditNoteId)).toEqual(["note-1"]);
    expect(served.unrequestedCreditNoteIds).toEqual(["note-3", "note-4"]);
  });

  it("asks for nothing when no sale was voided", async () => {
    const creditNotes = aCloud([aCreditNote("note-1", AUTHORIZED)]);

    const served = await serveRestoredRegisterCreditNoteAnswers(
      { creditNotes },
      { registerId: REGISTER, creditNoteIds: [] },
    );

    expect(served).toEqual({ answers: [], unrequestedCreditNoteIds: [] });
    expect(creditNotes.reads).toEqual([]);
  });
});
