import { describe, expect, it } from "vitest";
import {
  CREDIT_NOTE_C_VOUCHER_TYPE,
  CREDIT_NOTE_REASONS,
  creditNoteBreaksDateOrder,
  creditNoteIssueDate,
  creditsItsInvoice,
  creditWithinInvoice,
  mayTakeCreditNoteNumber,
  nextCreditNoteNumber,
  settleUnclearCreditNote,
} from "./credit-note.js";
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

describe("creditNoteBreaksDateOrder", () => {
  const authorizedOn = (issuedOn: string) => ({ kind: "authorized", issuedOn });

  it("does not break the order of a point of sale without authorized credit notes", () => {
    expect(creditNoteBreaksDateOrder("2026-10-07", [])).toBe(false);
  });

  it.each(["2026-10-07", "2026-10-06"])(
    "does not break the order when the latest authorized credit note is dated %s",
    (issuedOn) => {
      expect(creditNoteBreaksDateOrder("2026-10-07", [authorizedOn(issuedOn)])).toBe(false);
    },
  );

  it("breaks the order when a credit note dated later was authorized", () => {
    expect(
      creditNoteBreaksDateOrder("2026-10-07", [
        authorizedOn("2026-10-06"),
        authorizedOn("2026-10-08"),
      ]),
    ).toBe(true);
  });

  it.each([
    { kind: "not_requested" },
    { kind: "rejected" },
    { kind: "requested", issuedOn: "2026-10-09" },
    { kind: "regularization_required" },
  ])("ignores a credit note that is $kind", (standing) => {
    expect(creditNoteBreaksDateOrder("2026-10-07", [standing])).toBe(false);
  });
});

describe("creditWithinInvoice", () => {
  it("lets an invoice take credit up to its total, across credit notes", () => {
    expect(
      creditWithinInvoice({ invoiceTotal: 10_000, alreadyCredited: 4_000, asked: 6_000 }),
    ).toBe(true);
  });

  it("refuses credit beyond the invoice's total", () => {
    expect(
      creditWithinInvoice({ invoiceTotal: 10_000, alreadyCredited: 4_000, asked: 6_001 }),
    ).toBe(false);
  });

  it("refuses more credit for an invoice that is fully credited", () => {
    expect(creditWithinInvoice({ invoiceTotal: 10_000, alreadyCredited: 10_000, asked: 1 })).toBe(
      false,
    );
  });

  it("lets credit through when the invoice's total is not known", () => {
    expect(creditWithinInvoice({ invoiceTotal: null, alreadyCredited: 0, asked: 10_000 })).toBe(
      true,
    );
  });
});

describe("mayTakeCreditNoteNumber", () => {
  it("lets a credit note take a number when the point of sale has no other credit note", () => {
    expect(mayTakeCreditNoteNumber([])).toBe(true);
  });

  it.each(["not_requested", "authorized", "rejected"])(
    "lets a credit note take a number beside another one %s",
    (kind) => {
      expect(mayTakeCreditNoteNumber([{ kind: "authorized" }, { kind }])).toBe(true);
    },
  );

  it("takes no number while another credit note of the point of sale awaits its answer", () => {
    expect(mayTakeCreditNoteNumber([{ kind: "authorized" }, { kind: "requested" }])).toBe(false);
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

describe("CREDIT_NOTE_REASONS", () => {
  it("lists why a credit note is issued: an authorization no sale accounts for, or a voided sale", () => {
    expect(CREDIT_NOTE_REASONS).toEqual([
      "orphan",
      "sale_void",
      "sale_return",
      "rejected_document",
    ]);
  });
});

describe("creditsItsInvoice", () => {
  it.each([null, "authorized", "unclear"])(
    "counts a credit note answered %s against its invoice",
    (answerKind) => {
      expect(creditsItsInvoice(answerKind)).toBe(true);
    },
  );

  it.each(["rejected", "regularization_required"])(
    "counts nothing of a credit note answered %s",
    (answerKind) => {
      expect(creditsItsInvoice(answerKind)).toBe(false);
    },
  );
});
