import { describe, expect, it } from "vitest";
import { FACTURA_C_VOUCHER_TYPE } from "./factura-c-fiscal-block.js";
import {
  authorizedVoucherAmong,
  creditNotesDecidedFor,
  decideOrphanAuthorization,
  isKeptByCreditNote,
  type LocalRequestAtNumber,
  type LocalStanding,
  localStandingOfUnrecordedSale,
  type OrphanEvidence,
  orphanEvidenceOfRecordedRequest,
  orphanRegularization,
  otherVoucherToKeep,
  requestBehindVoucher,
  type SaleCreditNote,
  type SaleDocument,
  type VoucherReference,
  withVouchersConfirmedAuthorized,
} from "./orphan-authorization.js";
import type { TaxAuthorityVoucher } from "./unclear-outcome-decision.js";

const VOUCHER: TaxAuthorityVoucher = {
  issuedOn: "2026-10-01",
  total: 12_500,
  documentType: FACTURA_C_VOUCHER_TYPE,
  receiverDocumentType: 99,
  receiverDocumentNumber: 0,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-11",
};

const CONFIRMED: OrphanEvidence = {
  kind: "confirmed",
  pointOfSale: 12,
  number: 41,
  voucher: VOUCHER,
};

const OFFLINE_VOUCHER = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 13, number: 7 };

describe("decideOrphanAuthorization", () => {
  it("corrects a confirmed authorization of a sale that has another authorized voucher with a credit note", () => {
    const local: LocalStanding = {
      kind: "local_sale",
      saleId: "sale-1",
      otherAuthorizedVoucher: OFFLINE_VOUCHER,
    };

    expect(decideOrphanAuthorization({ evidence: CONFIRMED, local })).toEqual({
      kind: "credit_note",
      saleId: "sale-1",
      pointOfSale: 12,
      associatedVoucher: { voucherType: 11, pointOfSale: 12, number: 41 },
      keptVoucher: OFFLINE_VOUCHER,
      total: 12_500,
      receiverTaxStatusCode: 5,
    });
  });

  it("leaves a confirmed authorization that is the only voucher of its sale alone", () => {
    expect(
      decideOrphanAuthorization({
        evidence: CONFIRMED,
        local: { kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: null },
      }),
    ).toEqual({ kind: "none" });
  });

  it("reports a confirmed authorization with no local sale behind it as invoicing outside the register", () => {
    expect(
      decideOrphanAuthorization({ evidence: CONFIRMED, local: { kind: "no_local_sale" } }),
    ).toEqual({
      kind: "external_invoicing",
      pointOfSale: 12,
      documentType: "factura_c",
      number: 41,
      voucher: { issuedOn: "2026-10-01", total: 12_500, authorizationCode: "75123456789012" },
    });
  });

  it("leaves an authorization that is already regularized alone", () => {
    expect(
      decideOrphanAuthorization({ evidence: CONFIRMED, local: { kind: "already_regularized" } }),
    ).toEqual({ kind: "none" });
  });

  it.each<[string, LocalStanding]>([
    ["no local sale", { kind: "no_local_sale" }],
    [
      "another authorized voucher",
      { kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: OFFLINE_VOUCHER },
    ],
  ])("does nothing with an authorization that is not confirmed, even with %s", (_case, local) => {
    expect(decideOrphanAuthorization({ evidence: { kind: "not_confirmed" }, local })).toEqual({
      kind: "none",
    });
  });
});

describe("orphanRegularization", () => {
  const NOW = new Date("2026-10-02T15:00:00.000Z");

  it("turns a credit note decision into a credit note request with the given id", () => {
    const decision = decideOrphanAuthorization({
      evidence: CONFIRMED,
      local: { kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: OFFLINE_VOUCHER },
    });

    expect(orphanRegularization(decision, { creditNoteId: "credit-note-1", now: NOW })).toEqual({
      kind: "credit_note",
      creditNoteId: "credit-note-1",
      saleId: "sale-1",
      pointOfSale: 12,
      associatedVoucher: { voucherType: 11, pointOfSale: 12, number: 41 },
      keptVoucher: OFFLINE_VOUCHER,
      total: 12_500,
      receiverTaxStatusCode: 5,
    });
  });

  it("turns an external invoicing decision into the alert to open and an open task for a person", () => {
    const decision = decideOrphanAuthorization({
      evidence: CONFIRMED,
      local: { kind: "no_local_sale" },
    });

    expect(orphanRegularization(decision, { creditNoteId: "credit-note-1", now: NOW })).toEqual({
      kind: "external_invoicing",
      externalBilling: { pointOfSale: 12, documentType: "factura_c", number: 41 },
      task: {
        kind: "external_invoicing",
        state: "open",
        pointOfSale: 12,
        documentType: "factura_c",
        number: 41,
        voucher: { issuedOn: "2026-10-01", total: 12_500, authorizationCode: "75123456789012" },
        createdAt: NOW,
      },
    });
  });

  it("regularizes nothing when the decision is none", () => {
    expect(
      orphanRegularization({ kind: "none" }, { creditNoteId: "credit-note-1", now: NOW }),
    ).toBeNull();
  });
});

describe("requestBehindVoucher", () => {
  const REQUEST: LocalRequestAtNumber = {
    fiscalDocumentId: "document-1",
    saleId: "sale-1",
    issuedOn: "2026-10-01",
    total: 12_500,
    buyerTaxStatusCode: 5,
    answer: { kind: "unclear" },
  };

  it("finds the local request whose document is the voucher", () => {
    const other = { ...REQUEST, fiscalDocumentId: "document-2", saleId: "sale-2", total: 1 };

    expect(requestBehindVoucher(VOUCHER, [other, REQUEST])).toEqual(REQUEST);
  });

  it.each<[string, Partial<LocalRequestAtNumber>]>([
    ["another issue date", { issuedOn: "2026-10-02" }],
    ["another total", { total: 12_499 }],
    ["another buyer tax status", { buyerTaxStatusCode: 6 }],
  ])("finds no request when the voucher has %s than the request's document", (_case, change) => {
    expect(requestBehindVoucher(VOUCHER, [{ ...REQUEST, ...change }])).toBeNull();
  });

  it("never takes a request the tax authority rejected as the voucher, even with the same content", () => {
    expect(
      requestBehindVoucher(VOUCHER, [
        { ...REQUEST, answer: { kind: "rejected", codes: [10016], rejectionClass: "content" } },
      ]),
    ).toBeNull();
  });

  it.each<[string, LocalRequestAtNumber["answer"]]>([
    ["no answer yet", null],
    ["an unclear answer", { kind: "unclear" }],
    [
      "an authorization",
      { kind: "authorized", authorizationCode: "1", authorizationCodeDueOn: "2026-10-11" },
    ],
  ])("takes a matching request with %s as the voucher", (_case, answer) => {
    expect(requestBehindVoucher(VOUCHER, [{ ...REQUEST, answer }])).toEqual({ ...REQUEST, answer });
  });

  it("finds no request when there is none at the number", () => {
    expect(requestBehindVoucher(VOUCHER, [])).toBeNull();
  });
});

describe("authorizedVoucherAmong", () => {
  const AT_20 = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 20 };
  const AT_21 = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 21 };
  const realTime = (
    voucher: typeof AT_20,
    outcome: Extract<SaleDocument, { kind: "real_time" }>["outcome"],
  ): SaleDocument => ({ kind: "real_time", voucher, outcome });

  it("takes an offline document as authorized", () => {
    expect(authorizedVoucherAmong([{ kind: "offline", voucher: OFFLINE_VOUCHER }])).toEqual(
      OFFLINE_VOUCHER,
    );
  });

  it.each<[string, Extract<SaleDocument, { kind: "real_time" }>["outcome"]]>([
    [
      "the tax authority authorized",
      {
        answer: {
          kind: "authorized",
          authorizationCode: "1",
          authorizationCodeDueOn: "2026-10-11",
        },
        decision: null,
      },
    ],
    [
      "was adopted after an unclear answer",
      {
        answer: { kind: "unclear" },
        decision: { kind: "adopted", authorizationCode: "1", authorizationCodeDueOn: "2026-10-11" },
      },
    ],
  ])("takes a real-time document that %s as authorized", (_case, outcome) => {
    expect(authorizedVoucherAmong([realTime(AT_20, outcome)])).toEqual(AT_20);
  });

  it.each<[string, Extract<SaleDocument, { kind: "real_time" }>["outcome"]]>([
    ["has no answer yet", { answer: null, decision: null }],
    ["is still unclear", { answer: { kind: "unclear" }, decision: null }],
    [
      "the tax authority rejected",
      { answer: { kind: "rejected", codes: [10016], rejectionClass: "content" }, decision: null },
    ],
    ["was released", { answer: { kind: "unclear" }, decision: { kind: "released" } }],
    ["is conflicting", { answer: { kind: "unclear" }, decision: { kind: "conflicting" } }],
  ])("never takes a real-time document that %s as authorized", (_case, outcome) => {
    expect(authorizedVoucherAmong([realTime(AT_20, outcome)])).toBeNull();
  });

  it("takes the first authorized document of the sale, skipping those that are not", () => {
    expect(
      authorizedVoucherAmong([
        realTime(AT_20, { answer: { kind: "unclear" }, decision: { kind: "released" } }),
        realTime(AT_21, {
          answer: {
            kind: "authorized",
            authorizationCode: "1",
            authorizationCodeDueOn: "2026-10-11",
          },
          decision: null,
        }),
        { kind: "offline", voucher: OFFLINE_VOUCHER },
      ]),
    ).toEqual(AT_21);
  });

  it("takes a document the tax authority confirmed authorized as authorized", () => {
    expect(authorizedVoucherAmong([{ kind: "confirmed", voucher: AT_20 }])).toEqual(AT_20);
  });

  it("finds none in a sale with no other document", () => {
    expect(authorizedVoucherAmong([])).toBeNull();
  });
});

describe("orphanEvidenceOfRecordedRequest", () => {
  const document = { number: 41, issuedOn: "2026-10-01", total: 12_500, buyerTaxStatusCode: 5 };
  const request = (outcome: Extract<SaleDocument, { kind: "real_time" }>["outcome"]) => ({
    ...document,
    outcome,
  });

  it("confirms a request the tax authority authorized with the voucher it recorded", () => {
    expect(
      orphanEvidenceOfRecordedRequest({
        pointOfSale: 12,
        request: request({
          answer: {
            kind: "authorized",
            authorizationCode: "75123456789012",
            authorizationCodeDueOn: "2026-10-11",
          },
          decision: null,
        }),
      }),
    ).toEqual({ kind: "confirmed", pointOfSale: 12, number: 41, voucher: VOUCHER });
  });

  it("confirms a request whose authorization was adopted after an unclear answer", () => {
    expect(
      orphanEvidenceOfRecordedRequest({
        pointOfSale: 12,
        request: request({
          answer: { kind: "unclear" },
          decision: {
            kind: "adopted",
            authorizationCode: "75123456789012",
            authorizationCodeDueOn: "2026-10-11",
          },
        }),
      }),
    ).toEqual({ kind: "confirmed", pointOfSale: 12, number: 41, voucher: VOUCHER });
  });

  it.each<[string, Extract<SaleDocument, { kind: "real_time" }>["outcome"]]>([
    ["has no answer yet", { answer: null, decision: null }],
    ["is still unclear", { answer: { kind: "unclear" }, decision: null }],
    [
      "was rejected",
      { answer: { kind: "rejected", codes: [10016], rejectionClass: "content" }, decision: null },
    ],
    ["was released", { answer: { kind: "unclear" }, decision: { kind: "released" } }],
    ["is conflicting", { answer: { kind: "unclear" }, decision: { kind: "conflicting" } }],
  ])("does not confirm a request that %s", (_case, outcome) => {
    expect(orphanEvidenceOfRecordedRequest({ pointOfSale: 12, request: request(outcome) })).toEqual(
      { kind: "not_confirmed" },
    );
  });
});

describe("localStandingOfUnrecordedSale", () => {
  const OWN_VOUCHER = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 41 };
  const CREDITED_VOUCHER = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 40 };
  const authorizedAt = (voucher: VoucherReference): SaleDocument => ({
    kind: "real_time",
    voucher,
    outcome: {
      answer: { kind: "authorized", authorizationCode: "1", authorizationCodeDueOn: "2026-10-11" },
      decision: null,
    },
  });
  const standing = (otherDocuments: SaleDocument[], creditNotes: SaleCreditNote[] = []) =>
    localStandingOfUnrecordedSale(
      { saleId: "sale-1", voucher: OWN_VOUCHER },
      { otherDocuments, creditNotes },
    );

  it("stands as a local sale with the other authorized voucher when the sale has one", () => {
    expect(standing([{ kind: "offline", voucher: OFFLINE_VOUCHER }])).toEqual({
      kind: "local_sale",
      saleId: "sale-1",
      otherAuthorizedVoucher: OFFLINE_VOUCHER,
    });
  });

  it.each<[string, SaleDocument[]]>([
    ["no other document", []],
    [
      "only a rejected document",
      [
        {
          kind: "real_time",
          voucher: OFFLINE_VOUCHER,
          outcome: {
            answer: { kind: "rejected", codes: [10016], rejectionClass: "content" },
            decision: null,
          },
        },
      ],
    ],
  ])("stands as no local sale when the sale has %s", (_case, documents) => {
    expect(standing(documents)).toEqual({ kind: "no_local_sale" });
  });

  it("never keeps a voucher a credit note of the sale already credited", () => {
    expect(
      standing(
        [authorizedAt(CREDITED_VOUCHER), { kind: "offline", voucher: OFFLINE_VOUCHER }],
        [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher: OFFLINE_VOUCHER }],
      ),
    ).toEqual({ kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: OFFLINE_VOUCHER });
  });

  it("stands as no local sale when every other authorized voucher was already credited", () => {
    expect(
      standing(
        [authorizedAt(CREDITED_VOUCHER)],
        [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher: null }],
      ),
    ).toEqual({ kind: "no_local_sale" });
  });

  it("stands as the sale's only receipt when a credit note of the sale kept its voucher", () => {
    expect(
      standing(
        [authorizedAt(CREDITED_VOUCHER)],
        [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher: OWN_VOUCHER }],
      ),
    ).toEqual({ kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: null });
  });

  it.each<[string, VoucherReference]>([
    ["another number", { ...OWN_VOUCHER, number: 42 }],
    ["another point of sale", { ...OWN_VOUCHER, pointOfSale: 13 }],
    ["another voucher type", { ...OWN_VOUCHER, voucherType: 13 }],
  ])("tells its own voucher from a kept voucher of %s", (_case, keptVoucher) => {
    expect(
      standing(
        [{ kind: "offline", voucher: OFFLINE_VOUCHER }],
        [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher }],
      ),
    ).toEqual({ kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: OFFLINE_VOUCHER });
  });

  it.each<[string, VoucherReference]>([
    ["another number", { ...CREDITED_VOUCHER, number: 39 }],
    ["another point of sale", { ...CREDITED_VOUCHER, pointOfSale: 13 }],
    ["another voucher type", { ...CREDITED_VOUCHER, voucherType: 13 }],
  ])("still keeps a voucher when the credited one is of %s", (_case, creditedVoucher) => {
    expect(
      standing([authorizedAt(CREDITED_VOUCHER)], [{ creditedVoucher, keptVoucher: null }]),
    ).toEqual({ kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: CREDITED_VOUCHER });
  });
});

describe("the other voucher a credit note must keep", () => {
  const OWN_VOUCHER = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 41 };
  const CREDITED_VOUCHER = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 40 };
  const SECOND_VOUCHER = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 42 };
  const offlineAt = (voucher: VoucherReference): SaleDocument => ({ kind: "offline", voucher });

  it("is the first authorized document of the sale", () => {
    expect(
      otherVoucherToKeep(OWN_VOUCHER, {
        otherDocuments: [offlineAt(CREDITED_VOUCHER), offlineAt(SECOND_VOUCHER)],
        creditNotes: [],
      }),
    ).toEqual(CREDITED_VOUCHER);
  });

  it("skips a document a credit note of the sale already credited", () => {
    expect(
      otherVoucherToKeep(OWN_VOUCHER, {
        otherDocuments: [offlineAt(CREDITED_VOUCHER), offlineAt(SECOND_VOUCHER)],
        creditNotes: [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher: OWN_VOUCHER }],
      }),
    ).toBeNull();
    expect(
      otherVoucherToKeep(OWN_VOUCHER, {
        otherDocuments: [offlineAt(CREDITED_VOUCHER), offlineAt(SECOND_VOUCHER)],
        creditNotes: [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher: null }],
      }),
    ).toEqual(SECOND_VOUCHER);
  });

  it("is none when a credit note of the sale already kept the voucher", () => {
    expect(
      otherVoucherToKeep(OWN_VOUCHER, {
        otherDocuments: [offlineAt(SECOND_VOUCHER)],
        creditNotes: [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher: OWN_VOUCHER }],
      }),
    ).toBeNull();
  });

  it("is none when the sale has no other authorized document", () => {
    expect(otherVoucherToKeep(OWN_VOUCHER, { otherDocuments: [], creditNotes: [] })).toBeNull();
  });

  it.each<[string, VoucherReference, boolean]>([
    ["the same voucher", OWN_VOUCHER, true],
    ["another number", { ...OWN_VOUCHER, number: 42 }, false],
    ["another point of sale", { ...OWN_VOUCHER, pointOfSale: 13 }, false],
    ["another voucher type", { ...OWN_VOUCHER, voucherType: 13 }, false],
  ])("tells whether a credit note kept the voucher: %s", (_case, keptVoucher, kept) => {
    expect(
      isKeptByCreditNote(OWN_VOUCHER, [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher }]),
    ).toBe(kept);
  });

  it("is not kept by a credit note that kept nothing", () => {
    expect(
      isKeptByCreditNote(OWN_VOUCHER, [{ creditedVoucher: CREDITED_VOUCHER, keptVoucher: null }]),
    ).toBe(false);
  });
});

describe("the documents of a sale with the vouchers the tax authority confirmed", () => {
  const ASKING = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 19 };
  const AT_20 = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 20 };
  const AT_21 = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 21 };
  const releasedAt = (voucher: VoucherReference): SaleDocument => ({
    kind: "real_time",
    voucher,
    outcome: { answer: { kind: "unclear" }, decision: { kind: "released" } },
  });

  it("takes a document at a confirmed voucher as confirmed", () => {
    expect(withVouchersConfirmedAuthorized(ASKING, [releasedAt(AT_20)], [AT_20])).toEqual([
      { kind: "confirmed", voucher: AT_20 },
    ]);
  });

  it.each<[string, VoucherReference]>([
    ["another number", { ...AT_20, number: 21 }],
    ["another point of sale", { ...AT_20, pointOfSale: 13 }],
    ["another voucher type", { ...AT_20, voucherType: 13 }],
  ])("keeps a document whose voucher was not confirmed: %s", (_case, confirmed) => {
    expect(withVouchersConfirmedAuthorized(ASKING, [releasedAt(AT_20)], [confirmed])).toEqual([
      releasedAt(AT_20),
    ]);
  });

  it("never confirms another document at the asking voucher", () => {
    expect(withVouchersConfirmedAuthorized(ASKING, [releasedAt(ASKING)], [ASKING])).toEqual([
      releasedAt(ASKING),
    ]);
  });

  it("puts the documents only confirmed after the others", () => {
    const offlineAt21: SaleDocument = { kind: "offline", voucher: AT_21 };

    expect(
      withVouchersConfirmedAuthorized(ASKING, [releasedAt(AT_20), offlineAt21], [AT_20]),
    ).toEqual([offlineAt21, { kind: "confirmed", voucher: AT_20 }]);
  });
});

describe("the credit notes decided for a sale", () => {
  const CREDITED = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 20 };
  const KEPT = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 21 };
  const creditNoteOf = (saleId: string) => ({
    kind: "credit_note" as const,
    creditNoteId: `credit-note-${saleId}`,
    saleId,
    pointOfSale: 12,
    associatedVoucher: CREDITED,
    keptVoucher: KEPT,
    total: 12_500,
    receiverTaxStatusCode: 5,
  });

  it("takes the credited and the kept voucher of each credit note of the sale, skipping other sales and alerts", () => {
    const alert = orphanRegularization(
      decideOrphanAuthorization({ evidence: CONFIRMED, local: { kind: "no_local_sale" } }),
      { creditNoteId: "unused", now: new Date("2026-10-01T12:00:00.000Z") },
    );

    expect(
      creditNotesDecidedFor("sale-1", [creditNoteOf("sale-2"), alert, creditNoteOf("sale-1")]),
    ).toEqual([{ creditedVoucher: CREDITED, keptVoucher: KEPT }]);
  });
});
