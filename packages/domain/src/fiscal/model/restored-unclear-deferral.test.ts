import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import type { DeferredSale } from "./deferred-sale.js";
import type { UnclearDeferralDocument } from "./deferred-sale-recorded-event.js";
import type { RealTimeAuthorizationAnswer } from "./real-time-authorization.js";
import {
  type RestoredUnclearDeferralAnswer,
  rebuiltUnclearDeferral,
  restoredUnclearDeferralAnswer,
} from "./restored-unclear-deferral.js";
import type { UnclearOutcomeDecision } from "./unclear-outcome-decision.js";

const ANSWERED_AT = new Date("2026-10-08T15:00:00.000Z");
const DECIDED_AT = new Date("2026-10-08T16:30:00.000Z");

const AUTHORIZED: RealTimeAuthorizationAnswer = {
  kind: "authorized",
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-18",
};
const REJECTED: RealTimeAuthorizationAnswer = {
  kind: "rejected",
  codes: [10015],
  rejectionClass: "content",
};

function answerOf(
  answer: RealTimeAuthorizationAnswer | null,
  decision: UnclearOutcomeDecision | null = null,
) {
  return restoredUnclearDeferralAnswer(
    { answer, decision },
    { answeredAt: answer === null ? null : ANSWERED_AT, decidedAt: decision && DECIDED_AT },
  );
}

describe("the answer a restored register is told about an unclear-outcome deferral", () => {
  it("is unsettled when the tax authority was never asked", () => {
    expect(restoredUnclearDeferralAnswer(null, { answeredAt: null, decidedAt: null })).toEqual({
      kind: "unsettled",
    });
  });

  it.each([
    ["no answer yet", null],
    ["an unclear answer", { kind: "unclear" } as const],
    ["a request that was never attempted", { kind: "not_attempted" } as const],
  ])("is unsettled for %s and no decision", (_case, answer) => {
    expect(answerOf(answer)).toEqual({ kind: "unsettled" });
  });

  it("is authorized, with the code and the time the cloud got the answer, when the tax authority authorized", () => {
    expect(answerOf(AUTHORIZED)).toEqual({
      kind: "authorized",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-18",
      answeredAt: ANSWERED_AT,
    });
  });

  it("is rejected, with the time the cloud got the answer, when the tax authority rejected", () => {
    expect(answerOf(REJECTED)).toEqual({ kind: "rejected", answeredAt: ANSWERED_AT });
  });

  it("is authorized, with the time of the decision, when the cloud adopted the voucher the tax authority held", () => {
    expect(
      answerOf(
        { kind: "unclear" },
        {
          kind: "adopted",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-18",
        },
      ),
    ).toEqual({
      kind: "authorized",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-18",
      answeredAt: DECIDED_AT,
    });
  });

  it.each([
    ["released", { kind: "released" } as const],
    ["conflicting", { kind: "conflicting" } as const],
  ])("is unsettled when the cloud decided the document was %s", (_case, decision) => {
    expect(answerOf({ kind: "unclear" }, decision)).toEqual({ kind: "unsettled" });
  });

  it("goes by the clear answer of the tax authority over a decision recorded beside it", () => {
    expect(answerOf(REJECTED, { kind: "released" })).toEqual({
      kind: "rejected",
      answeredAt: ANSWERED_AT,
    });
  });

  it("is unsettled when the instant it would report is not recorded", () => {
    expect(
      restoredUnclearDeferralAnswer(
        { answer: AUTHORIZED, decision: null },
        { answeredAt: null, decidedAt: DECIDED_AT },
      ),
    ).toEqual({ kind: "unsettled" });
    expect(
      restoredUnclearDeferralAnswer(
        {
          answer: { kind: "unclear" },
          decision: {
            kind: "adopted",
            authorizationCode: "75123456789012",
            authorizationCodeDueOn: "2026-10-18",
          },
        },
        { answeredAt: ANSWERED_AT, decidedAt: null },
      ),
    ).toEqual({ kind: "unsettled" });
  });
});

const DEFERRED_SALE: DeferredSale = {
  id: "deferred-1",
  saleId: "sale-1",
  occurredAt: new Date("2026-10-08T14:59:58.000Z"),
  total: 12_500,
  reason: "unclear_outcome",
  shortCode: "7KQ4M2P9",
  routedAt: new Date("2026-10-08T15:00:00.000Z"),
};

const UNCLEAR_DOCUMENT: UnclearDeferralDocument = {
  fiscalDocumentId: "document-1",
  pointOfSale: 7,
  number: 42,
  issuedOn: "2026-10-08",
  document: {
    invoiceClass: "C",
    total: 12_500,
    netAmount: 12_500,
    vatAmount: 0,
    issuer: {
      legalName: FICTIONAL_LEGAL_NAME,
      cuit: FICTIONAL_CUIT,
      taxStatus: "MONOTRIBUTO",
      grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
      activityStartDate: "2020-01-01",
      version: 3,
    },
    buyerTaxStatusCode: 5,
    buyerTaxStatusDescription: "Consumidor Final",
  },
  reservedAt: new Date("2026-10-08T14:59:58.000Z"),
};

function rebuiltFor(answer: RestoredUnclearDeferralAnswer) {
  return rebuiltUnclearDeferral(DEFERRED_SALE, UNCLEAR_DOCUMENT, answer);
}

describe("the deferral a restored register rebuilds from an unclear outcome", () => {
  it("is the record it had, still pending, when the outcome is unsettled", () => {
    expect(rebuiltFor({ kind: "unsettled" })).toEqual({
      deferredSale: DEFERRED_SALE,
      authorizedDocument: null,
    });
  });

  it("keeps the record's identifier and short code but gives the rejection as its reason when rejected", () => {
    expect(rebuiltFor({ kind: "rejected", answeredAt: ANSWERED_AT })).toEqual({
      deferredSale: { ...DEFERRED_SALE, reason: "rejected" },
      authorizedDocument: null,
    });
  });

  it("keeps the record as it was, with the authorized document that satisfies it, when authorized", () => {
    expect(
      rebuiltFor({
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-18",
        answeredAt: ANSWERED_AT,
      }),
    ).toEqual({
      deferredSale: DEFERRED_SALE,
      authorizedDocument: {
        id: "document-1",
        saleId: "sale-1",
        pointOfSale: 7,
        number: 42,
        issuedOn: "2026-10-08",
        document: UNCLEAR_DOCUMENT.document,
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-18",
        reservedAt: new Date("2026-10-08T14:59:58.000Z"),
        satisfiedAt: ANSWERED_AT,
      },
    });
  });
});
