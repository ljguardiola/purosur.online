import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PreEmissionGateOutcome } from "./pre-emission-gate.js";
import {
  AUTHORIZATION_CALL_MARGIN_MS,
  authorizationCallDeadline,
  DEFERRAL_REASONS,
  decideRealTimeAuthorization,
  invoiceDateOf,
  mayStartAuthorizationCall,
  medianRoundTripMs,
  nextInvoiceNumber,
  realTimeAuthorizationResolution,
  REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
  ROUND_TRIP_SAMPLE_SIZE,
  taxAuthorityRejectionAnswer,
} from "./real-time-authorization.js";

describe("ROUND_TRIP_SAMPLE_SIZE", () => {
  it("looks at the last 12 health checks", () => {
    expect(ROUND_TRIP_SAMPLE_SIZE).toBe(12);
  });
});

describe("medianRoundTripMs", () => {
  it("is null without samples", () => {
    expect(medianRoundTripMs([])).toBeNull();
  });

  it("is the only sample when there is one", () => {
    expect(medianRoundTripMs([180])).toBe(180);
  });

  it("is the middle sample when the count is odd", () => {
    expect(medianRoundTripMs([300, 100, 200])).toBe(200);
  });

  it("is the mean of the two middle samples when the count is even", () => {
    expect(medianRoundTripMs([100, 400, 200, 300])).toBe(250);
  });

  it("rounds a mean ending in half a millisecond up", () => {
    expect(medianRoundTripMs([100, 101])).toBe(101);
  });

  it("considers only the last 12 samples, the newest last", () => {
    const older = [9_000, 9_000, 9_000];
    const lastTwelve = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

    expect(medianRoundTripMs([...older, ...lastTwelve])).toBe(65);
  });

  it("keeps all samples when there are exactly 12", () => {
    expect(medianRoundTripMs([1, 1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9])).toBe(5);
  });

  it("lies between the smallest and the largest of the last samples", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 60_000 }), { minLength: 1 }), (samples) => {
        const lastSamples = samples.slice(-ROUND_TRIP_SAMPLE_SIZE);
        const median = medianRoundTripMs(samples);

        expect(median).toBeGreaterThanOrEqual(Math.min(...lastSamples));
        expect(median).toBeLessThanOrEqual(Math.max(...lastSamples));
      }),
    );
  });

  it("does not depend on the order of the last samples", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 60_000 }), { minLength: 1, maxLength: 12 }),
        (samples) => {
          expect(medianRoundTripMs([...samples].reverse())).toBe(medianRoundTripMs(samples));
        },
      ),
    );
  });
});

const RECEIVED_AT = new Date("2026-10-01T12:00:00.000Z");

describe("REAL_TIME_AUTHORIZATION_TIMEOUT_MS", () => {
  it("makes the register wait 5 seconds at most", () => {
    expect(REAL_TIME_AUTHORIZATION_TIMEOUT_MS).toBe(5_000);
  });
});

describe("AUTHORIZATION_CALL_MARGIN_MS", () => {
  it("keeps a margin of 500 milliseconds", () => {
    expect(AUTHORIZATION_CALL_MARGIN_MS).toBe(500);
  });
});

describe("authorizationCallDeadline", () => {
  it("is the moment of the request plus the budget, minus the margin, minus half the round trip", () => {
    const deadline = authorizationCallDeadline({
      receivedAt: RECEIVED_AT,
      timeoutMs: 5_000,
      roundTripMedianMs: 200,
    });

    expect(deadline).toEqual(new Date("2026-10-01T12:00:04.400Z"));
  });

  it("falls on the earlier whole millisecond when half the round trip is fractional", () => {
    const deadline = authorizationCallDeadline({
      receivedAt: RECEIVED_AT,
      timeoutMs: 5_000,
      roundTripMedianMs: 101,
    });

    expect(deadline).toEqual(new Date("2026-10-01T12:00:04.449Z"));
  });

  it("moves back by half of each extra millisecond of the round trip and by each one of the margin", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 10_000 }),
        fc.integer({ min: 0, max: 4_000 }),
        (timeoutMs, roundTripMedianMs) => {
          const deadline = authorizationCallDeadline({
            receivedAt: RECEIVED_AT,
            timeoutMs,
            roundTripMedianMs,
          });

          expect(deadline.getTime()).toBe(
            Math.floor(
              RECEIVED_AT.getTime() +
                timeoutMs -
                AUTHORIZATION_CALL_MARGIN_MS -
                roundTripMedianMs / 2,
            ),
          );
        },
      ),
    );
  });
});

describe("mayStartAuthorizationCall", () => {
  const deadline = new Date("2026-10-01T12:00:04.400Z");

  it("allows the call before the deadline", () => {
    expect(mayStartAuthorizationCall(deadline, new Date(deadline.getTime() - 1))).toBe(true);
  });

  it("allows the call at the deadline itself", () => {
    expect(mayStartAuthorizationCall(deadline, deadline)).toBe(true);
  });

  it("refuses the call once the deadline has passed", () => {
    expect(mayStartAuthorizationCall(deadline, new Date(deadline.getTime() + 1))).toBe(false);
  });
});

describe("nextInvoiceNumber", () => {
  it("is unknown while the tax authority's count is unknown", () => {
    expect(
      nextInvoiceNumber({ localLastAuthorized: 7, taxAuthorityLastAuthorized: null }),
    ).toBeNull();
  });

  it("follows the tax authority's count when the register authorized nothing yet", () => {
    expect(nextInvoiceNumber({ localLastAuthorized: null, taxAuthorityLastAuthorized: 40 })).toBe(
      41,
    );
  });

  it("is the first number when neither authorized anything", () => {
    expect(nextInvoiceNumber({ localLastAuthorized: null, taxAuthorityLastAuthorized: 0 })).toBe(1);
  });

  it("follows the register's own count when it is ahead of the tax authority's", () => {
    expect(nextInvoiceNumber({ localLastAuthorized: 45, taxAuthorityLastAuthorized: 40 })).toBe(46);
  });

  it("follows the larger of the two counts, plus one", () => {
    fc.assert(
      fc.property(
        fc.option(fc.nat({ max: 100_000_000 }), { nil: null }),
        fc.nat({ max: 100_000_000 }),
        (localLastAuthorized, taxAuthorityLastAuthorized) => {
          expect(nextInvoiceNumber({ localLastAuthorized, taxAuthorityLastAuthorized })).toBe(
            Math.max(localLastAuthorized ?? 0, taxAuthorityLastAuthorized) + 1,
          );
        },
      ),
    );
  });
});

describe("invoiceDateOf", () => {
  it("is the calendar day in Argentina", () => {
    expect(invoiceDateOf(new Date("2026-10-01T23:30:00.000Z"))).toBe("2026-10-01");
  });

  it("is still the day before in Argentina after midnight UTC", () => {
    expect(invoiceDateOf(new Date("2026-10-02T02:59:59.000Z"))).toBe("2026-10-01");
  });

  it("is the next day in Argentina from 03:00 UTC", () => {
    expect(invoiceDateOf(new Date("2026-10-02T03:00:00.000Z"))).toBe("2026-10-02");
  });
});

const DOCUMENT = {
  invoiceClass: "C",
  total: 12_500,
  netAmount: 12_500,
  vatAmount: 0,
  issuer: {
    legalName: "Comercio de Prueba SA",
    cuit: "20000000001",
    taxStatus: "MONOTRIBUTO",
    grossIncomeRegistration: "901-123456-7",
    activityStartDate: "2020-01-01",
    version: 3,
  },
  buyerTaxStatusCode: 5,
} as const;

const PASSED: PreEmissionGateOutcome = { kind: "passed", document: DOCUMENT };
const NOW = new Date("2026-10-01T12:00:00.000Z");
const ONLINE = {
  lastHealthCheckOkAt: new Date(NOW.getTime() - 1_000),
  tokenValid: true,
  arcaReachable: true,
};
const SERIES = {
  pointOfSale: 12,
  localLastAuthorized: 40,
  taxAuthorityLastAuthorized: 38,
  documentWaiting: false,
};

describe("decideRealTimeAuthorization", () => {
  it("reserves the next number of the point of sale for the sale's document", () => {
    expect(
      decideRealTimeAuthorization({ gate: PASSED, online: ONLINE, now: NOW, series: SERIES }),
    ).toEqual({ kind: "reserve", pointOfSale: 12, number: 41, document: DOCUMENT });
  });

  it("follows the tax authority's count when the register authorized nothing yet", () => {
    expect(
      decideRealTimeAuthorization({
        gate: PASSED,
        online: ONLINE,
        now: NOW,
        series: { ...SERIES, localLastAuthorized: null, taxAuthorityLastAuthorized: 500 },
      }),
    ).toMatchObject({ kind: "reserve", number: 501 });
  });

  it("defers a sale whose pre-emission gate failed, even when everything else is missing too", () => {
    expect(
      decideRealTimeAuthorization({
        gate: { kind: "failed", reason: "legal_name_missing" },
        online: { ...ONLINE, tokenValid: false },
        now: NOW,
        series: { ...SERIES, pointOfSale: null, documentWaiting: true },
      }),
    ).toEqual({ kind: "defer", reason: "pre_emission_gate_failed" });
  });

  it.each([
    ["the last health check is too old", { ...ONLINE, lastHealthCheckOkAt: null }],
    ["the token is not valid", { ...ONLINE, tokenValid: false }],
    ["the tax authority is not reachable", { ...ONLINE, arcaReachable: false }],
  ])("defers a sale when %s", (_case, online) => {
    expect(decideRealTimeAuthorization({ gate: PASSED, online, now: NOW, series: SERIES })).toEqual(
      {
        kind: "defer",
        reason: "fiscally_offline",
      },
    );
  });

  it("judges the online evidence at the moment of the decision", () => {
    expect(
      decideRealTimeAuthorization({
        gate: PASSED,
        online: ONLINE,
        now: new Date(NOW.getTime() + 20_000),
        series: SERIES,
      }),
    ).toEqual({ kind: "defer", reason: "fiscally_offline" });
  });

  it("defers a sale of a register without a point of sale, before looking at the series", () => {
    expect(
      decideRealTimeAuthorization({
        gate: PASSED,
        online: ONLINE,
        now: NOW,
        series: {
          ...SERIES,
          pointOfSale: null,
          documentWaiting: true,
          taxAuthorityLastAuthorized: null,
        },
      }),
    ).toEqual({ kind: "defer", reason: "point_of_sale_missing" });
  });

  it("defers a sale while a document of the series waits for an answer, before looking at the count", () => {
    expect(
      decideRealTimeAuthorization({
        gate: PASSED,
        online: ONLINE,
        now: NOW,
        series: { ...SERIES, documentWaiting: true, taxAuthorityLastAuthorized: null },
      }),
    ).toEqual({ kind: "defer", reason: "document_waiting" });
  });

  it("defers a sale until the register knows the tax authority's count", () => {
    expect(
      decideRealTimeAuthorization({
        gate: PASSED,
        online: ONLINE,
        now: NOW,
        series: { ...SERIES, taxAuthorityLastAuthorized: null },
      }),
    ).toEqual({ kind: "defer", reason: "tax_authority_count_unknown" });
  });
});

describe("DEFERRAL_REASONS", () => {
  it("lists every reason a sale can leave real-time authorization", () => {
    expect(DEFERRAL_REASONS).toEqual([
      "pre_emission_gate_failed",
      "fiscally_offline",
      "point_of_sale_missing",
      "document_waiting",
      "tax_authority_count_unknown",
      "rejected",
      "unclear_outcome",
    ]);
  });
});

describe("taxAuthorityRejectionAnswer", () => {
  it("is a rejection carrying the codes the tax authority gave", () => {
    expect(taxAuthorityRejectionAnswer([10015, 10048])).toEqual({
      kind: "rejected",
      codes: [10015, 10048],
    });
  });

  it("is unclear when the number or date does not follow the last one authorized", () => {
    expect(taxAuthorityRejectionAnswer([10015, 10016])).toEqual({ kind: "unclear" });
  });

  it("is unclear when that is the only code", () => {
    expect(taxAuthorityRejectionAnswer([10016])).toEqual({ kind: "unclear" });
  });

  it("is a rejection without codes when the tax authority gave none", () => {
    expect(taxAuthorityRejectionAnswer([])).toEqual({ kind: "rejected", codes: [] });
  });
});

describe("realTimeAuthorizationResolution", () => {
  it("authorizes the document with the code and its expiry date", () => {
    expect(
      realTimeAuthorizationResolution({
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      }),
    ).toEqual({
      state: "AUTHORIZED",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-11",
    });
  });

  it("rejects the document and defers the sale as rejected", () => {
    expect(realTimeAuthorizationResolution({ kind: "rejected", codes: [10015] })).toEqual({
      state: "REJECTED",
      deferralReason: "rejected",
    });
  });

  it("leaves the outcome unknown when the call was not attempted", () => {
    expect(realTimeAuthorizationResolution({ kind: "not_attempted" })).toEqual({
      state: "UNKNOWN",
      deferralReason: "unclear_outcome",
    });
  });

  it("leaves the outcome unknown when the answer is unclear", () => {
    expect(realTimeAuthorizationResolution({ kind: "unclear" })).toEqual({
      state: "UNKNOWN",
      deferralReason: "unclear_outcome",
    });
  });
});
