import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
} from "./factura-c-fiscal-block.js";
import {
  decideUnclearOutcome,
  type TaxAuthorityEvidence,
  type TaxAuthorityVoucher,
  UNCLEAR_OUTCOME_REASK_INTERVAL_MS,
  UNCLEAR_OUTCOME_SETTLING_DELAY_MS,
  unclearOutcomeSettlesAt,
  voucherMatchesDocument,
} from "./unclear-outcome-decision.js";

const DOCUMENT = { number: 41, issuedOn: "2026-10-01", total: 12_500, buyerTaxStatusCode: 5 };

const MATCHING_VOUCHER: TaxAuthorityVoucher = {
  issuedOn: "2026-10-01",
  total: 12_500,
  documentType: FACTURA_C_VOUCHER_TYPE,
  receiverDocumentType: FINAL_CONSUMER_DOCUMENT_TYPE,
  receiverDocumentNumber: FINAL_CONSUMER_DOCUMENT_NUMBER,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-11",
};

const ABANDONED_AT = new Date("2026-10-01T12:00:00.000Z");
const SETTLED_AT = new Date("2026-10-01T12:01:00.000Z");

function decide(evidence: TaxAuthorityEvidence, now: Date = SETTLED_AT) {
  return decideUnclearOutcome({ abandonedAt: ABANDONED_AT, now, document: DOCUMENT, evidence });
}

describe("unclear outcome policy", () => {
  it("lets an abandoned request settle for 60 seconds and asks again every 30 seconds", () => {
    expect(UNCLEAR_OUTCOME_SETTLING_DELAY_MS).toBe(60_000);
    expect(UNCLEAR_OUTCOME_REASK_INTERVAL_MS).toBe(30_000);
  });

  it("settles one settling delay after the abandonment", () => {
    expect(unclearOutcomeSettlesAt(ABANDONED_AT)).toEqual(SETTLED_AT);
  });
});

describe("voucherMatchesDocument", () => {
  it("accepts a factura C with the document's date, total and receiver", () => {
    expect(voucherMatchesDocument(MATCHING_VOUCHER, DOCUMENT)).toBe(true);
  });

  it.each([
    ["date", { issuedOn: "2026-10-02" }],
    ["total", { total: 12_501 }],
    ["document type", { documentType: 6 }],
    ["receiver document type", { receiverDocumentType: 80 }],
    ["receiver document number", { receiverDocumentNumber: 20_111_111_112 }],
    ["receiver tax status", { receiverTaxStatusCode: 6 }],
  ])("refuses a voucher with another %s", (_field, change) => {
    expect(voucherMatchesDocument({ ...MATCHING_VOUCHER, ...change }, DOCUMENT)).toBe(false);
  });

  it("ignores the authorization code and its due date", () => {
    expect(
      voucherMatchesDocument(
        { ...MATCHING_VOUCHER, authorizationCode: "1", authorizationCodeDueOn: "2027-01-01" },
        DOCUMENT,
      ),
    ).toBe(true);
  });

  it("matches exactly when date, total and tax status all equal the document's", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 1 }),
        fc.integer({ min: 0, max: 1 }),
        (taxStatusCode, totalDelta, dateDelta) => {
          const voucher = {
            ...MATCHING_VOUCHER,
            receiverTaxStatusCode: taxStatusCode,
            total: DOCUMENT.total + totalDelta,
            issuedOn: dateDelta === 0 ? DOCUMENT.issuedOn : "2026-10-02",
          };
          expect(voucherMatchesDocument(voucher, DOCUMENT)).toBe(
            taxStatusCode === DOCUMENT.buyerTaxStatusCode && totalDelta === 0 && dateDelta === 0,
          );
        },
      ),
    );
  });
});

describe("decideUnclearOutcome", () => {
  describe("while the settling delay runs", () => {
    it("stays pending until the delay ends, whatever the tax authority says", () => {
      const evidences: TaxAuthorityEvidence[] = [
        { kind: "voucher", voucher: MATCHING_VOUCHER },
        { kind: "no_voucher", lastAuthorized: 40 },
        { kind: "no_answer" },
      ];
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: UNCLEAR_OUTCOME_SETTLING_DELAY_MS - 1 }),
          fc.constantFrom(...evidences),
          (elapsedMs, evidence) => {
            const now = new Date(ABANDONED_AT.getTime() + elapsedMs);
            expect(decide(evidence, now)).toEqual({ kind: "pending", askAgainAt: SETTLED_AT });
          },
        ),
      );
    });

    it("decides at the very moment the delay ends", () => {
      expect(decide({ kind: "no_voucher", lastAuthorized: 40 }, SETTLED_AT)).toEqual({
        kind: "released",
      });
    });
  });

  describe("once the delay passed", () => {
    it("adopts the authorization of a voucher with the document's content", () => {
      expect(decide({ kind: "voucher", voucher: MATCHING_VOUCHER })).toEqual({
        kind: "adopted",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      });
    });

    it("reports a voucher with other content as conflicting", () => {
      expect(
        decide({ kind: "voucher", voucher: { ...MATCHING_VOUCHER, total: 99_999 } }),
      ).toEqual({ kind: "conflicting" });
    });

    it("releases the number when there is no voucher and the last authorized number is below it", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: DOCUMENT.number - 1 }), (lastAuthorized) => {
          expect(decide({ kind: "no_voucher", lastAuthorized })).toEqual({ kind: "released" });
        }),
      );
    });

    it("keeps asking when there is no voucher but the last authorized number reached the number", () => {
      fc.assert(
        fc.property(fc.integer({ min: DOCUMENT.number, max: 1_000_000 }), (lastAuthorized) => {
          expect(decide({ kind: "no_voucher", lastAuthorized })).toEqual({
            kind: "pending",
            askAgainAt: new Date(SETTLED_AT.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
          });
        }),
      );
    });

    it("keeps asking when the last authorized number could not be read", () => {
      expect(decide({ kind: "no_voucher", lastAuthorized: null })).toEqual({
        kind: "pending",
        askAgainAt: new Date(SETTLED_AT.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
    });

    it("keeps asking, from the moment of asking, when the tax authority gave no answer", () => {
      const later = new Date("2026-10-01T14:00:00.000Z");
      expect(decide({ kind: "no_answer" }, later)).toEqual({
        kind: "pending",
        askAgainAt: new Date(later.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
    });
  });
});
