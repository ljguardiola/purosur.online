import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
} from "./factura-c-fiscal-block.js";
import type { RealTimeAuthorizationAnswer } from "./real-time-authorization.js";
import {
  awaitsUnclearOutcomeDecision,
  decideUnclearOutcome,
  outcomeToldToAskingRegister,
  type TaxAuthorityEvidence,
  type TaxAuthorityVoucher,
  UNCLEAR_OUTCOME_REASK_INTERVAL_MS,
  UNCLEAR_OUTCOME_SETTLING_DELAY_MS,
  type UnclearOutcomeDecision,
  unclearDocumentSettlement,
  unclearOutcomeSettlesAt,
  unclearOutcomeSince,
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

describe("awaitsUnclearOutcomeDecision", () => {
  it("awaits a decision for a request still without an answer", () => {
    expect(awaitsUnclearOutcomeDecision(null)).toBe(true);
  });

  it.each([
    ["unclear", { kind: "unclear" }],
    ["not attempted", { kind: "not_attempted" }],
  ] as const)("awaits a decision for a request answered %s", (_name, answer) => {
    expect(awaitsUnclearOutcomeDecision(answer)).toBe(true);
  });

  it.each<[string, RealTimeAuthorizationAnswer]>([
    [
      "authorized",
      {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    ],
    ["rejected", { kind: "rejected", codes: [10015], rejectionClass: "content" }],
  ])("awaits no decision for a request answered %s", (_name, answer) => {
    expect(awaitsUnclearOutcomeDecision(answer)).toBe(false);
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
      expect(decide({ kind: "voucher", voucher: { ...MATCHING_VOUCHER, total: 99_999 } })).toEqual({
        kind: "conflicting",
      });
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

describe("outcomeToldToAskingRegister", () => {
  it("tells the authorization the tax authority answered, with its code and due date, whatever was decided", () => {
    const answer: RealTimeAuthorizationAnswer = {
      kind: "authorized",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-11",
    };

    expect(outcomeToldToAskingRegister({ answer, decision: null })).toEqual({
      kind: "answered",
      answer,
    });
    expect(outcomeToldToAskingRegister({ answer, decision: { kind: "released" } })).toEqual({
      kind: "answered",
      answer,
    });
  });

  it("tells the rejection the tax authority answered, with its codes and class, whatever was decided", () => {
    const answer: RealTimeAuthorizationAnswer = {
      kind: "rejected",
      codes: [10015],
      rejectionClass: "content",
    };

    expect(outcomeToldToAskingRegister({ answer, decision: null })).toEqual({
      kind: "answered",
      answer,
    });
    expect(outcomeToldToAskingRegister({ answer, decision: { kind: "conflicting" } })).toEqual({
      kind: "answered",
      answer,
    });
  });

  it.each<[string, RealTimeAuthorizationAnswer | null]>([
    ["no answer", null],
    ["an unclear answer", { kind: "unclear" }],
    ["a call never attempted", { kind: "not_attempted" }],
  ])(
    "tells the recorded decision of a request with %s, and pending while it has none",
    (_name, answer) => {
      expect(outcomeToldToAskingRegister({ answer, decision: { kind: "conflicting" } })).toEqual({
        kind: "decided",
        decision: { kind: "conflicting" },
      });
      expect(outcomeToldToAskingRegister({ answer, decision: null })).toEqual({ kind: "pending" });
    },
  );
});

describe("unclearDocumentSettlement", () => {
  it("frees the number of a document whose decision is released", () => {
    expect(unclearDocumentSettlement({ kind: "decided", decision: { kind: "released" } })).toEqual({
      state: "RELEASED",
    });
  });

  it("keeps consumed the number of a document whose decision is conflicting", () => {
    expect(
      unclearDocumentSettlement({ kind: "decided", decision: { kind: "conflicting" } }),
    ).toEqual({ state: "CONFLICTING" });
  });

  it("authorizes a document whose decision is adopted, with the code and due date of the voucher", () => {
    expect(
      unclearDocumentSettlement({
        kind: "decided",
        decision: {
          kind: "adopted",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-11",
        },
      }),
    ).toEqual({
      state: "AUTHORIZED",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-11",
    });
  });

  it("settles a document the tax authority had already authorized as a timely authorization", () => {
    expect(
      unclearDocumentSettlement({
        kind: "answered",
        answer: {
          kind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-11",
        },
      }),
    ).toEqual({
      state: "AUTHORIZED",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-11",
    });
  });

  it("settles a document the tax authority had already rejected as a timely rejection", () => {
    expect(
      unclearDocumentSettlement({
        kind: "answered",
        answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
      }),
    ).toEqual({ state: "REJECTED", deferralReason: "rejected" });
  });
});

describe("unclearOutcomeSince", () => {
  const ANSWERED_AT = new Date("2026-10-01T12:00:05.000Z");
  const NOT_AFTER = new Date("2026-10-01T11:59:59.000Z");

  it.each<[string, RealTimeAuthorizationAnswer]>([
    ["unclear", { kind: "unclear" }],
    ["not attempted", { kind: "not_attempted" }],
  ])(
    "is when the tax authority's answer was recorded as %s while no decision is recorded",
    (_name, answer) => {
      expect(
        unclearOutcomeSince({
          answer,
          answeredAt: ANSWERED_AT,
          notAfter: NOT_AFTER,
          decision: null,
        }),
      ).toEqual(ANSWERED_AT);
    },
  );

  it("is the moment the call was due to be over when no answer was ever recorded", () => {
    expect(
      unclearOutcomeSince({
        answer: null,
        answeredAt: null,
        notAfter: NOT_AFTER,
        decision: null,
      }),
    ).toEqual(NOT_AFTER);
  });

  it("is never for a request the tax authority answered clearly", () => {
    expect(
      unclearOutcomeSince({
        answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
        answeredAt: ANSWERED_AT,
        notAfter: NOT_AFTER,
        decision: null,
      }),
    ).toBeNull();
    expect(
      unclearOutcomeSince({
        answer: {
          kind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-11",
        },
        answeredAt: ANSWERED_AT,
        notAfter: NOT_AFTER,
        decision: null,
      }),
    ).toBeNull();
  });

  it.each<[string, UnclearOutcomeDecision]>([
    ["released", { kind: "released" }],
    ["conflicting", { kind: "conflicting" }],
    [
      "adopted",
      {
        kind: "adopted",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    ],
  ])("is never once the outcome was %s", (_name, decision) => {
    expect(
      unclearOutcomeSince({
        answer: { kind: "unclear" },
        answeredAt: ANSWERED_AT,
        notAfter: NOT_AFTER,
        decision,
      }),
    ).toBeNull();
    expect(
      unclearOutcomeSince({ answer: null, answeredAt: null, notAfter: NOT_AFTER, decision }),
    ).toBeNull();
  });
});
