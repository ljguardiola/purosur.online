import { describe, expect, it } from "vitest";
import {
  type AwaitingCreditNote,
  type CreditNoteStanding,
  type CreditNoteToIssue,
  confirmedCreditNoteAnswer,
  creditNoteAnswerOf,
  creditNoteToIssuePayload,
  invoiceToCorrect,
  restoredCreditNoteIssuedAt,
  restoredCreditNoteSettlement,
  type SaleInvoice,
  tiedToInvoice,
} from "./sale-credit-note.js";

const REAL_TIME: SaleInvoice = {
  origin: "real_time",
  state: "AUTHORIZED",
  pointOfSale: 3,
  number: 1204,
  buyerTaxStatusCode: 5,
};

const OFFLINE: SaleInvoice = {
  origin: "offline",
  state: "AUTHORIZED",
  pointOfSale: 8,
  number: 77,
  buyerTaxStatusCode: 5,
};

describe("invoiceToCorrect", () => {
  it("finds no invoice in a sale without documents", () => {
    expect(invoiceToCorrect([])).toBeNull();
  });

  it("is the factura C voucher of the real-time invoice the tax authority authorized", () => {
    expect(invoiceToCorrect([REAL_TIME])).toEqual({
      voucher: { voucherType: 11, pointOfSale: 3, number: 1204 },
      buyerTaxStatusCode: 5,
    });
  });

  it("is the factura C voucher of the contingency document", () => {
    expect(invoiceToCorrect([OFFLINE])).toEqual({
      voucher: { voucherType: 11, pointOfSale: 8, number: 77 },
      buyerTaxStatusCode: 5,
    });
  });

  it.each([["REQUESTING"], ["UNKNOWN"], ["REJECTED"], ["RELEASED"], ["CONFLICTING"]] as const)(
    "ignores a real-time document that is %s",
    (state) => {
      expect(invoiceToCorrect([{ ...REAL_TIME, state }])).toBeNull();
    },
  );

  it.each([
    ["the real-time one first", [REAL_TIME, OFFLINE]],
    ["the contingency one first", [OFFLINE, REAL_TIME]],
  ])(
    "is the contingency document the customer received when both are authorized, with %s",
    (_case, invoices) => {
      expect(invoiceToCorrect(invoices)?.voucher).toEqual({
        voucherType: 11,
        pointOfSale: 8,
        number: 77,
      });
    },
  );

  it("is the authorized real-time invoice when the other real-time documents are not", () => {
    expect(
      invoiceToCorrect([
        { ...REAL_TIME, state: "REJECTED", number: 1203 },
        REAL_TIME,
        { ...REAL_TIME, state: "UNKNOWN", number: 1205 },
      ])?.voucher.number,
    ).toBe(1204);
  });
});

const CREDIT_NOTE: CreditNoteToIssue = {
  creditNoteId: "credit-note-1",
  saleId: "sale-1",
  total: 7_500,
  receiverTaxStatusCode: 5,
  correctedVoucher: { voucherType: 11, pointOfSale: 8, number: 77 },
  origin: { kind: "sale_void" },
};

const PAYLOAD = {
  id: "credit-note-1",
  total: 7_500,
  receiver_tax_status_code: 5,
  corrects: { voucher_type: 11, point_of_sale: 8, number: 77 },
};

describe("creditNoteToIssuePayload", () => {
  it("describes the credit note the void asks for", () => {
    expect(creditNoteToIssuePayload(CREDIT_NOTE)).toEqual(PAYLOAD);
  });

  it("dates the credit note a return asks for", () => {
    expect(
      creditNoteToIssuePayload({
        ...CREDIT_NOTE,
        origin: { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-07" },
      }),
    ).toEqual({ ...PAYLOAD, issued_on: "2026-10-07" });
  });

  it("describes a credit note that waits for its invoice, which it does not correct yet", () => {
    expect(
      creditNoteToIssuePayload({
        creditNoteId: "credit-note-1",
        saleId: "sale-1",
        total: 7_500,
        receiverTaxStatusCode: null,
        correctedVoucher: null,
        origin: { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-07" },
      }),
    ).toEqual({
      id: "credit-note-1",
      total: 7_500,
      receiver_tax_status_code: null,
      corrects: null,
      issued_on: "2026-10-07",
    });
  });
});

describe("tiedToInvoice", () => {
  it("makes a credit note that waited for its invoice correct that invoice", () => {
    const waiting: AwaitingCreditNote = {
      creditNoteId: "credit-note-1",
      saleId: "sale-1",
      total: 7_500,
      receiverTaxStatusCode: null,
      correctedVoucher: null,
      origin: { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-07" },
    };

    expect(
      tiedToInvoice(waiting, {
        voucher: { voucherType: 11, pointOfSale: 3, number: 1204 },
        buyerTaxStatusCode: 5,
      }),
    ).toEqual({
      ...waiting,
      receiverTaxStatusCode: 5,
      correctedVoucher: { voucherType: 11, pointOfSale: 3, number: 1204 },
    });
  });
});

const AUTHORIZED_STANDING: CreditNoteStanding = {
  kind: "authorized",
  number: 9,
  issuedOn: "2026-10-07",
  requestedAt: new Date("2026-10-07T10:29:00.000Z"),
  authorizationCode: "74123456789012",
  authorizationCodeDueOn: "2026-10-17",
};

const UNCONFIRMED_STANDINGS: [string, CreditNoteStanding][] = [
  ["not requested yet", { kind: "not_requested" }],
  [
    "requested and unanswered",
    {
      kind: "requested",
      number: 9,
      issuedOn: "2026-10-07",
      requestedAt: new Date("2026-10-07T10:29:00.000Z"),
      unclearAnsweredAt: null,
    },
  ],
  [
    "requested and answered unclearly",
    {
      kind: "requested",
      number: 9,
      issuedOn: "2026-10-07",
      requestedAt: new Date("2026-10-07T10:29:00.000Z"),
      unclearAnsweredAt: new Date("2026-10-07T10:31:00.000Z"),
    },
  ],
];

describe("creditNoteAnswerOf", () => {
  it("is the authorization with the point of sale, issued when it was requested", () => {
    expect(creditNoteAnswerOf(AUTHORIZED_STANDING, 12)).toEqual({
      kind: "authorized",
      pointOfSale: 12,
      number: 9,
      issuedOn: "2026-10-07",
      issuedAt: new Date("2026-10-07T10:29:00.000Z"),
      authorizationCode: "74123456789012",
      authorizationCodeDueOn: "2026-10-17",
    });
  });

  it("is the rejection", () => {
    expect(creditNoteAnswerOf({ kind: "rejected" }, 12)).toEqual({ kind: "rejected" });
  });

  it("is that a person must regularize the credit note when it cannot be issued", () => {
    expect(creditNoteAnswerOf({ kind: "regularization_required" }, 12)).toEqual({
      kind: "regularization_required",
    });
  });

  it.each(UNCONFIRMED_STANDINGS)("is in progress when the credit note is %s", (_case, standing) => {
    expect(creditNoteAnswerOf(standing, 12)).toEqual({ kind: "in_progress" });
  });
});

describe("confirmedCreditNoteAnswer", () => {
  it("is the authorization the tax authority gave", () => {
    expect(confirmedCreditNoteAnswer(AUTHORIZED_STANDING, 12)).toEqual({
      kind: "authorized",
      pointOfSale: 12,
      number: 9,
      issuedOn: "2026-10-07",
      issuedAt: new Date("2026-10-07T10:29:00.000Z"),
      authorizationCode: "74123456789012",
      authorizationCodeDueOn: "2026-10-17",
    });
  });

  it("is the rejection the tax authority gave", () => {
    expect(confirmedCreditNoteAnswer({ kind: "rejected" }, 12)).toEqual({ kind: "rejected" });
  });

  it("is that a person must regularize a credit note that cannot be issued", () => {
    expect(confirmedCreditNoteAnswer({ kind: "regularization_required" }, 12)).toEqual({
      kind: "regularization_required",
    });
  });

  it.each(UNCONFIRMED_STANDINGS)("is no answer when the credit note is %s", (_case, standing) => {
    expect(confirmedCreditNoteAnswer(standing, 12)).toBeNull();
  });
});

describe("restoredCreditNoteSettlement", () => {
  it("answers with the authorization the tax authority gave", () => {
    expect(
      restoredCreditNoteSettlement({ standing: AUTHORIZED_STANDING, pointOfSale: 12 }, false),
    ).toEqual({
      kind: "answered",
      answer: {
        kind: "authorized",
        pointOfSale: 12,
        number: 9,
        issuedOn: "2026-10-07",
        issuedAt: new Date("2026-10-07T10:29:00.000Z"),
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-17",
      },
    });
  });

  it("answers with the rejection the tax authority gave", () => {
    expect(
      restoredCreditNoteSettlement({ standing: { kind: "rejected" }, pointOfSale: 12 }, false),
    ).toEqual({ kind: "answered", answer: { kind: "rejected" } });
  });

  it("answers that a person must regularize a credit note that cannot be issued", () => {
    expect(
      restoredCreditNoteSettlement(
        { standing: { kind: "regularization_required" }, pointOfSale: 12 },
        false,
      ),
    ).toEqual({ kind: "answered", answer: { kind: "regularization_required" } });
  });

  it("answers that the invoice was already credited when the refusal was kept and no credit note was recorded", () => {
    expect(restoredCreditNoteSettlement(null, true)).toEqual({
      kind: "answered",
      answer: { kind: "already_credited" },
    });
  });

  it("was never requested when no credit note was recorded and no refusal was kept", () => {
    expect(restoredCreditNoteSettlement(null, false)).toEqual({ kind: "never_requested" });
  });

  it.each(UNCONFIRMED_STANDINGS)(
    "is unsettled when the recorded credit note is %s",
    (_case, standing) => {
      expect(restoredCreditNoteSettlement({ standing, pointOfSale: 12 }, false)).toEqual({
        kind: "unsettled",
      });
    },
  );

  it("is unsettled, never already credited, when the recorded credit note is still in progress beside a refusal", () => {
    expect(
      restoredCreditNoteSettlement({ standing: { kind: "not_requested" }, pointOfSale: 12 }, true),
    ).toEqual({ kind: "unsettled" });
  });

  it("answers with the recorded credit note's own answer beside a refusal", () => {
    expect(
      restoredCreditNoteSettlement({ standing: { kind: "rejected" }, pointOfSale: 12 }, true),
    ).toEqual({ kind: "answered", answer: { kind: "rejected" } });
  });
});

describe("restoredCreditNoteSettlement of a credit note the cloud holds as issued offline", () => {
  const ISSUED_OFFLINE = {
    kind: "issued_offline",
    pointOfSale: 31,
    number: 4,
    issuedOn: "2026-10-07",
    issuedAt: new Date("2026-10-07T10:29:00.000Z"),
    offlineAuthorizationCode: "71234567890123",
    fortnight: { start: "2026-10-01", end: "2026-10-15" },
  } as const;

  it("answers it as issued offline, never as one still to request", () => {
    expect(restoredCreditNoteSettlement(null, false, ISSUED_OFFLINE)).toEqual({
      kind: "answered",
      answer: ISSUED_OFFLINE,
    });
  });

  it("answers it as issued offline whatever the cloud's own credit notes and refusals say", () => {
    expect(
      restoredCreditNoteSettlement(
        { standing: { kind: "rejected" }, pointOfSale: 12 },
        true,
        ISSUED_OFFLINE,
      ),
    ).toEqual({ kind: "answered", answer: ISSUED_OFFLINE });
  });

  it("leaves the other settlements as they were when the cloud holds none", () => {
    expect(restoredCreditNoteSettlement(null, false, null)).toEqual({ kind: "never_requested" });
  });
});

describe("restoredCreditNoteIssuedAt", () => {
  const ISSUED_AT = new Date("2026-10-07T10:29:00.000Z");

  it("is the moment an authorized credit note was issued", () => {
    expect(
      restoredCreditNoteIssuedAt({
        kind: "authorized",
        pointOfSale: 7,
        number: 9,
        issuedOn: "2026-10-07",
        issuedAt: ISSUED_AT,
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-17",
      }),
    ).toEqual(ISSUED_AT);
  });

  it("is the moment a credit note issued offline was issued", () => {
    expect(
      restoredCreditNoteIssuedAt({
        kind: "issued_offline",
        pointOfSale: 31,
        number: 4,
        issuedOn: "2026-10-07",
        issuedAt: ISSUED_AT,
        offlineAuthorizationCode: "71234567890123",
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
      }),
    ).toEqual(ISSUED_AT);
  });

  it.each([
    { kind: "rejected" },
    { kind: "regularization_required" },
    { kind: "already_credited" },
  ] as const)("is unknown for an answer that issued nothing: $kind", (answer) => {
    expect(restoredCreditNoteIssuedAt(answer)).toBeNull();
  });
});
