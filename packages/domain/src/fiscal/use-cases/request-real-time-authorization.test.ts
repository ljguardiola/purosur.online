import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import { deferredSaleRecordedEvent } from "../model/deferred-sale-recorded-event.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import type { RequestedFiscalDocument } from "./real-time-authorization-ports.js";
import { requestRealTimeAuthorization } from "./request-real-time-authorization.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeRealTimeFiscalDocuments,
  FakeRealTimeTaxAuthority,
  FakeRoundTripSamples,
} from "./test-support/fake-real-time-authorization.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";
import { ScriptedShortCodes } from "./test-support/scripted-short-codes.js";

const START = new Date("2026-10-01T12:00:00.000Z");
const ANSWER_DELAY_MS = 1_200;
const FISCAL_DOCUMENT_ID = "fiscal-document-1";
const RESERVED_AT = new Date("2026-10-01T11:59:58.000Z");
const SHORT_CODES = ["7KQ4M2P9", "R3XW8H5N"];

const ORIGIN = { registerId: "register-1", actorId: "cashier" };

function deferredRecord(
  reason: "rejected" | "unclear_outcome",
  routedAt: Date,
  shortCode = "7KQ4M2P9",
) {
  const sale = {
    id: "id-1",
    saleId: "sale-1",
    occurredAt: RESERVED_AT,
    total: 12_500,
    reason,
    shortCode,
    routedAt,
  };
  return {
    sale,
    event: deferredSaleRecordedEvent({ eventId: "id-2", ...ORIGIN, deferredSale: sale }),
  };
}

const DOCUMENT: FacturaC = {
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
};

const SALE_EVENT: PushedEvent = {
  event_id: "event-1",
  device_seq: 17,
  aggregate_type: "sale",
  aggregate_id: "sale-1",
  event_type: "sale_completed",
  schema_version: 1,
  payload: { total: 12_500 },
  occurred_at: "2026-10-01T11:59:58.000Z",
  actor_id: "user-1",
  chain_hmac: "hmac-1",
};

const WAITING = {
  fiscalDocumentId: FISCAL_DOCUMENT_ID,
  saleId: "sale-1",
  pointOfSale: 12,
  number: 41,
  issuedOn: "2026-10-01",
  document: DOCUMENT,
  reservedAt: RESERVED_AT,
  origin: ORIGIN,
  saleEvent: SALE_EVENT,
};

function request({
  answer = { kind: "unclear" },
  samples = [100, 300, 200],
  waiting = WAITING,
  takenShortCodes = [],
}: {
  answer?: RealTimeAuthorizationAnswer;
  samples?: readonly number[];
  waiting?: RequestedFiscalDocument | null;
  takenShortCodes?: string[];
} = {}) {
  const clock = new ManualClock(START);
  const documents = new FakeRealTimeFiscalDocuments(waiting, takenShortCodes);
  const roundTrips = new FakeRoundTripSamples(samples);
  const taxAuthority = new FakeRealTimeTaxAuthority(answer, () => clock.advanceBy(ANSWER_DELAY_MS));
  const outcome = requestRealTimeAuthorization(
    {
      documents,
      roundTrips,
      taxAuthority,
      clock,
      ids: new SequentialIds(),
      shortCodes: new ScriptedShortCodes(SHORT_CODES),
    },
    { saleId: "sale-1" },
  );
  return { documents, roundTrips, taxAuthority, outcome };
}

describe("requestRealTimeAuthorization", () => {
  it("asks the tax authority with the document, the sale's event, the 5 second budget and the median round trip", async () => {
    const { taxAuthority, outcome } = request({ samples: [100, 300, 200] });
    await outcome;

    expect(taxAuthority.calls).toEqual([
      {
        fiscalDocumentId: FISCAL_DOCUMENT_ID,
        saleId: "sale-1",
        pointOfSale: 12,
        number: 41,
        issuedOn: "2026-10-01",
        document: DOCUMENT,
        saleEvent: SALE_EVENT,
        timeoutMs: 5_000,
        roundTripMedianMs: 200,
      },
    ]);
  });

  it("uses the median of the last 12 round trips only", async () => {
    const { taxAuthority, outcome } = request({
      samples: [9_000, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
    });
    await outcome;

    expect(taxAuthority.calls[0]?.roundTripMedianMs).toBe(65);
  });

  it("authorizes the document with the code and its expiry date, stamped when the answer arrived", async () => {
    const { documents, outcome } = request({
      answer: {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    });

    await expect(outcome).resolves.toEqual({ kind: "authorized" });
    expect(documents.resolutions).toEqual([
      {
        fiscalDocumentId: FISCAL_DOCUMENT_ID,
        saleId: "sale-1",
        resolution: {
          state: "AUTHORIZED",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-11",
        },
        resolvedAt: new Date(START.getTime() + ANSWER_DELAY_MS),
        deferredSale: null,
      },
    ]);
  });

  it("rejects the document when the tax authority rejects it", async () => {
    const { documents, outcome } = request({
      answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
    });

    await expect(outcome).resolves.toEqual({ kind: "rejected" });
    expect(documents.resolutions.map(({ resolution }) => resolution)).toEqual([
      { state: "REJECTED", deferralReason: "rejected" },
    ]);
  });

  it.each([
    ["the answer is unclear", { kind: "unclear" }],
    ["the call was not attempted", { kind: "not_attempted" }],
  ] satisfies [string, RealTimeAuthorizationAnswer][])(
    "leaves the outcome unknown and the sale deferred when %s",
    async (_case, answer) => {
      const { documents, outcome } = request({ answer });

      await expect(outcome).resolves.toEqual({ kind: "unclear" });
      expect(documents.resolutions.map(({ resolution }) => resolution)).toEqual([
        { state: "UNKNOWN", deferralReason: "unclear_outcome" },
      ]);
    },
  );

  it("does nothing for a sale with no document waiting for an answer", async () => {
    const { documents, roundTrips, taxAuthority, outcome } = request({ waiting: null });

    await expect(outcome).resolves.toEqual({ kind: "not_waiting" });
    expect(taxAuthority.calls).toEqual([]);
    expect(documents.resolutions).toEqual([]);
    expect(roundTrips.reads).toBe(0);
  });

  it("makes no call and leaves the outcome unknown when the register has no round trip to report", async () => {
    const { documents, taxAuthority, outcome } = request({
      samples: [],
      answer: {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    });

    await expect(outcome).resolves.toEqual({ kind: "unclear" });
    expect(taxAuthority.calls).toEqual([]);
    expect(documents.resolutions).toEqual([
      {
        fiscalDocumentId: FISCAL_DOCUMENT_ID,
        saleId: "sale-1",
        resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" },
        resolvedAt: START,
        deferredSale: deferredRecord("unclear_outcome", START),
      },
    ]);
  });

  it("makes no call and leaves the outcome unknown when the sale's event is no longer held", async () => {
    const { documents, taxAuthority, outcome } = request({
      waiting: { ...WAITING, saleEvent: null },
      answer: {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    });

    await expect(outcome).resolves.toEqual({ kind: "unclear" });
    expect(taxAuthority.calls).toEqual([]);
    expect(documents.resolutions).toEqual([
      {
        fiscalDocumentId: FISCAL_DOCUMENT_ID,
        saleId: "sale-1",
        resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" },
        resolvedAt: START,
        deferredSale: deferredRecord("unclear_outcome", START),
      },
    ]);
  });

  it("records the deferred sale of a rejected document with the sale's time and total, routed when the answer arrived", async () => {
    const { documents, outcome } = request({
      answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
    });
    await outcome;

    expect(documents.resolutions.map(({ deferredSale }) => deferredSale)).toEqual([
      deferredRecord("rejected", new Date(START.getTime() + ANSWER_DELAY_MS)),
    ]);
  });

  it("records the deferred sale of an unclear answer", async () => {
    const { documents, outcome } = request({ answer: { kind: "unclear" } });
    await outcome;

    expect(documents.resolutions.map(({ deferredSale }) => deferredSale)).toEqual([
      deferredRecord("unclear_outcome", new Date(START.getTime() + ANSWER_DELAY_MS)),
    ]);
  });

  it("draws another short code for the deferred sale when the first is already taken", async () => {
    const { documents, outcome } = request({
      answer: { kind: "unclear" },
      takenShortCodes: ["7KQ4M2P9"],
    });

    await expect(outcome).resolves.toEqual({ kind: "unclear" });
    expect(
      documents.resolutionAttempts.map(({ deferredSale }) => [
        deferredSale?.sale.id,
        deferredSale?.sale.shortCode,
        deferredSale?.event.event_id,
      ]),
    ).toEqual([
      ["id-1", "7KQ4M2P9", "id-2"],
      ["id-1", "R3XW8H5N", "id-2"],
    ]);
    expect(documents.resolutions.map(({ deferredSale }) => deferredSale?.sale.shortCode)).toEqual([
      "R3XW8H5N",
    ]);
  });
});
