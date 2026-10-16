import { describe, expect, it } from "vitest";
import {
  CREDIT_NOTE_C_VOUCHER_TYPE,
  creditNoteIssueDate,
  nextCreditNoteNumber,
  settleUnclearCreditNote,
} from "./orphan-credit-note.js";
import {
  type TaxAuthorityVoucher,
  UNCLEAR_OUTCOME_REASK_INTERVAL_MS,
  UNCLEAR_OUTCOME_SETTLING_DELAY_MS,
} from "./unclear-outcome-decision.js";

const UNCLEAR_SINCE = new Date("2026-10-02T15:00:00.000Z");
const SETTLED_AT = new Date(UNCLEAR_SINCE.getTime() + UNCLEAR_OUTCOME_SETTLING_DELAY_MS);
const CREDIT_NOTE = { number: 3, issuedOn: "2026-10-02", total: 12_500, receiverTaxStatusCode: 5 };

const MATCHING_VOUCHER: TaxAuthorityVoucher = {
  issuedOn: "2026-10-02",
  total: 12_500,
  documentType: 13,
  receiverDocumentType: 99,
  receiverDocumentNumber: 0,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789099",
  authorizationCodeDueOn: "2026-10-12",
};

describe("credit note C", () => {
  it("is voucher type 13", () => {
    expect(CREDIT_NOTE_C_VOUCHER_TYPE).toBe(13);
  });

  it("takes the number after the last one the tax authority authorized", () => {
    expect(nextCreditNoteNumber(0)).toBe(1);
    expect(nextCreditNoteNumber(41)).toBe(42);
  });

  it("is dated with the Argentine calendar day it is issued", () => {
    expect(creditNoteIssueDate(new Date("2026-10-03T01:30:00.000Z"))).toBe("2026-10-02");
    expect(creditNoteIssueDate(new Date("2026-10-03T03:00:00.000Z"))).toBe("2026-10-03");
  });
});

describe("settleUnclearCreditNote", () => {
  const settle = (
    evidence: Parameters<typeof settleUnclearCreditNote>[0]["evidence"],
    now: Date = SETTLED_AT,
  ) =>
    settleUnclearCreditNote({
      unclearSince: UNCLEAR_SINCE,
      now,
      creditNote: CREDIT_NOTE,
      evidence,
    });

  it("adopts the credit note voucher the tax authority holds at the requested number", () => {
    expect(settle({ kind: "voucher", voucher: MATCHING_VOUCHER })).toEqual({
      kind: "adopted",
      authorizationCode: "75123456789099",
      authorizationCodeDueOn: "2026-10-12",
    });
  });

  it("does not adopt a factura C found at the number", () => {
    expect(settle({ kind: "voucher", voucher: { ...MATCHING_VOUCHER, documentType: 11 } })).toEqual(
      {
        kind: "released",
        foreignVoucher: {
          issuedOn: "2026-10-02",
          total: 12_500,
          authorizationCode: "75123456789099",
        },
      },
    );
  });

  it("releases the number, naming the voucher, when the voucher at it is not the credit note", () => {
    expect(settle({ kind: "voucher", voucher: { ...MATCHING_VOUCHER, total: 99 } })).toEqual({
      kind: "released",
      foreignVoucher: {
        issuedOn: "2026-10-02",
        total: 99,
        authorizationCode: "75123456789099",
      },
    });
  });

  it("releases the request when the tax authority has not reached its number", () => {
    expect(settle({ kind: "no_voucher", lastAuthorized: 2 })).toEqual({
      kind: "released",
      foreignVoucher: null,
    });
  });

  it("asks again later when the tax authority has reached the number but shows no voucher there", () => {
    expect(settle({ kind: "no_voucher", lastAuthorized: 3 })).toEqual({
      kind: "pending",
      askAgainAt: new Date(SETTLED_AT.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
    });
  });

  it("asks again later when the tax authority does not answer", () => {
    expect(settle({ kind: "no_answer" })).toEqual({
      kind: "pending",
      askAgainAt: new Date(SETTLED_AT.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
    });
  });

  it("waits for the request to settle before judging it", () => {
    const early = new Date(SETTLED_AT.getTime() - 1);

    expect(settle({ kind: "no_voucher", lastAuthorized: 2 }, early)).toEqual({
      kind: "pending",
      askAgainAt: SETTLED_AT,
    });
  });
});
