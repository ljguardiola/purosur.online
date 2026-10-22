import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import { deferredSaleSatisfiedEvent } from "../model/deferred-sale-satisfied-event.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import type {
  UnclearFiscalDocument,
  UnclearOutcomeAnswer,
} from "./apply-unclear-outcome-decision-ports.js";
import { applyUnclearOutcomeDecisions } from "./apply-unclear-outcome-decisions.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";
import {
  FakeUnclearFiscalDocuments,
  FakeUnclearOutcomeCloud,
} from "./test-support/fake-unclear-outcome-decisions.js";

const NOW = new Date("2026-10-01T12:05:00.000Z");

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

function saleEvent(saleId: string): PushedEvent {
  return {
    event_id: `event-of-${saleId}`,
    device_seq: 17,
    aggregate_type: "sale",
    aggregate_id: saleId,
    event_type: "sale_completed",
    schema_version: 1,
    payload: { total: 12_500 },
    occurred_at: "2026-10-01T11:59:58.000Z",
    actor_id: "user-1",
    chain_hmac: "hmac-1",
  };
}

const ORIGIN = { registerId: "register-1", actorId: "cashier" };
const RESERVED_AT = new Date("2026-10-01T11:59:58.000Z");

function unclear(
  index: number,
  withEvent = true,
  deferredSale: { id: string } | null = null,
): UnclearFiscalDocument {
  return {
    origin: ORIGIN,
    deferredSale,
    fiscalDocumentId: `doc-${index}`,
    saleId: `sale-${index}`,
    pointOfSale: 12,
    number: 40 + index,
    issuedOn: "2026-10-01",
    document: DOCUMENT,
    reservedAt: RESERVED_AT,
    saleEvent: withEvent ? saleEvent(`sale-${index}`) : null,
  };
}

function question(index: number, withEvent = true) {
  const {
    origin: _origin,
    deferredSale: _deferredSale,
    reservedAt: _reservedAt,
    ...document
  } = unclear(index, withEvent);
  return document;
}

function apply(
  documents: readonly UnclearFiscalDocument[],
  answers: Record<string, UnclearOutcomeAnswer>,
  failOnDocument?: string,
) {
  const store = new FakeUnclearFiscalDocuments(documents);
  store.failOnDocument = failOnDocument;
  const cloud = new FakeUnclearOutcomeCloud(new Map(Object.entries(answers)));
  const outcome = applyUnclearOutcomeDecisions({
    documents: store,
    cloud,
    clock: new ManualClock(NOW),
    ids: new SequentialIds(),
  });
  return { store, cloud, outcome };
}

describe("applying the decisions of the documents left with an unclear outcome", () => {
  it("asks about each unclear document with what the cloud needs to identify it", async () => {
    const { cloud, outcome } = apply([unclear(1), unclear(2)], {});

    await outcome;

    expect(cloud.questions).toEqual([question(1), question(2)]);
  });

  it("asks nothing when no document is unclear", async () => {
    const { cloud, outcome } = apply([], {});

    expect(await outcome).toEqual({ kind: "applied", settled: [], stillUnclear: [], failed: [] });
    expect(cloud.questions).toEqual([]);
  });

  it("releases the document of a released decision at the moment it applies it", async () => {
    const { store, outcome } = apply([unclear(1)], {
      "doc-1": { kind: "decided", decision: { kind: "released" } },
    });

    expect(await outcome).toEqual({
      kind: "applied",
      settled: ["doc-1"],
      stillUnclear: [],
      failed: [],
    });
    expect(store.settlements).toEqual([
      {
        fiscalDocumentId: "doc-1",
        saleId: "sale-1",
        settlement: { state: "RELEASED" },
        settledAt: NOW,
        deferredSaleSatisfied: null,
      },
    ]);
  });

  it("keeps consumed the number of a conflicting decision", async () => {
    const { store, outcome } = apply([unclear(1)], {
      "doc-1": { kind: "decided", decision: { kind: "conflicting" } },
    });

    await outcome;

    expect(store.settlements.map(({ settlement }) => settlement)).toEqual([
      { state: "CONFLICTING" },
    ]);
  });

  it("authorizes the document of an adopted decision with the code and due date", async () => {
    const { store, outcome } = apply([unclear(1)], {
      "doc-1": {
        kind: "decided",
        decision: {
          kind: "adopted",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-11",
        },
      },
    });

    await outcome;

    expect(store.settlements.map(({ settlement }) => settlement)).toEqual([
      {
        state: "AUTHORIZED",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    ]);
  });

  it("applies a clear answer of the tax authority as a timely answer", async () => {
    const { store, outcome } = apply([unclear(1), unclear(2)], {
      "doc-1": {
        kind: "answered",
        answer: {
          kind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-11",
        },
      },
      "doc-2": {
        kind: "answered",
        answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
      },
    });

    await outcome;

    expect(store.settlements.map(({ settlement }) => settlement)).toEqual([
      {
        state: "AUTHORIZED",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
      { state: "REJECTED", deferralReason: "rejected" },
    ]);
  });

  it.each<[string, UnclearOutcomeAnswer]>([
    ["pending", { kind: "pending" }],
    ["no answer", { kind: "no_answer" }],
  ])("changes nothing for a document whose decision is %s", async (_name, answer) => {
    const { store, outcome } = apply([unclear(1)], { "doc-1": answer });

    expect(await outcome).toEqual({
      kind: "applied",
      settled: [],
      stillUnclear: ["doc-1"],
      failed: [],
    });
    expect(store.settlements).toEqual([]);
  });

  it("asks about a document whose sale event the register no longer holds without one, and settles it with the answer", async () => {
    const { cloud, store, outcome } = apply([unclear(1, false)], {
      "doc-1": { kind: "decided", decision: { kind: "released" } },
    });

    expect(await outcome).toEqual({
      kind: "applied",
      settled: ["doc-1"],
      stillUnclear: [],
      failed: [],
    });
    expect(cloud.questions).toEqual([question(1, false)]);
    expect(cloud.questions[0]?.saleEvent).toBeNull();
    expect(store.settlements.map(({ settlement }) => settlement)).toEqual([{ state: "RELEASED" }]);
  });

  it("settles the other documents and reports the one whose settling failed", async () => {
    const { store, outcome } = apply(
      [unclear(1), unclear(2), unclear(3)],
      {
        "doc-1": { kind: "decided", decision: { kind: "released" } },
        "doc-2": { kind: "decided", decision: { kind: "released" } },
        "doc-3": { kind: "pending" },
      },
      "doc-2",
    );

    const result = await outcome;

    expect(result).toMatchObject({
      kind: "applied",
      settled: ["doc-1"],
      stillUnclear: ["doc-3"],
    });
    expect(result.failed.map(({ fiscalDocumentId }) => fiscalDocumentId)).toEqual(["doc-2"]);
    expect(result.failed[0]?.error).toEqual(new Error("settling doc-2 failed"));
    expect(store.settlements.map(({ fiscalDocumentId }) => fiscalDocumentId)).toEqual(["doc-1"]);
  });
});

describe("applying a decision to a document whose sale already has a deferred record", () => {
  const ADOPTED: UnclearOutcomeAnswer = {
    kind: "decided",
    decision: {
      kind: "adopted",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-11",
    },
  };

  it("satisfies the record with the authorized document and reports it", async () => {
    const { store, outcome } = apply([unclear(1, true, { id: "deferred-1" })], {
      "doc-1": ADOPTED,
    });

    await outcome;

    expect(store.settlements.map(({ deferredSaleSatisfied }) => deferredSaleSatisfied)).toEqual([
      deferredSaleSatisfiedEvent({
        eventId: "id-1",
        ...ORIGIN,
        deferredSaleId: "deferred-1",
        saleId: "sale-1",
        fiscalDocumentId: "doc-1",
        pointOfSale: 12,
        number: 41,
        issuedOn: "2026-10-01",
        document: DOCUMENT,
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
        reservedAt: RESERVED_AT,
        satisfiedAt: NOW,
      }),
    ]);
  });

  it("carries in the report everything a restored register needs to rebuild the authorized document", async () => {
    const { store, outcome } = apply([unclear(1, true, { id: "deferred-1" })], {
      "doc-1": ADOPTED,
    });

    await outcome;

    expect(store.settlements[0]?.deferredSaleSatisfied?.payload).toMatchObject({
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-11",
      reserved_at: RESERVED_AT.toISOString(),
      document: { invoice_class: "C", total: 12_500 },
    });
  });

  it.each<[string, UnclearOutcomeAnswer]>([
    ["released", { kind: "decided", decision: { kind: "released" } }],
    ["conflicting", { kind: "decided", decision: { kind: "conflicting" } }],
    [
      "rejected",
      {
        kind: "answered",
        answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
      },
    ],
  ])("reports no satisfaction when the document ends %s", async (_name, answer) => {
    const { store, outcome } = apply([unclear(1, true, { id: "deferred-1" })], {
      "doc-1": answer,
    });

    await outcome;

    expect(store.settlements.map(({ deferredSaleSatisfied }) => deferredSaleSatisfied)).toEqual([
      null,
    ]);
  });
});
