import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import { askAboutUnclearOutcome } from "./ask-about-unclear-outcome.js";
import { authorizeFiscalDocument } from "./authorize-fiscal-document.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakePointOfSaleLanes,
  FakeTaxAuthorityInvoicing,
  FakeWsaaTokenSource,
} from "./test-support/fake-fiscal-document-authorization.js";
import { FakeUnclearOutcomeStore } from "./test-support/fake-unclear-outcome.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const REGISTER_ID = "register-1";
const FISCAL_DOCUMENT_ID = "fiscal-document-1";

const SALE_EVENT: PushedEvent = {
  event_id: "event-1",
  device_seq: 17,
  aggregate_type: "Sale",
  aggregate_id: "sale-1",
  event_type: "sale_completed",
  schema_version: 2,
  payload: { total: 12_500 },
  occurred_at: "2026-10-01T11:59:58.000Z",
  actor_id: "user-1",
  chain_hmac: "hmac-1",
};

const REQUEST = {
  fiscalDocumentId: FISCAL_DOCUMENT_ID,
  saleId: "sale-1",
  pointOfSale: 12,
  number: 41,
  issuedOn: "2026-10-01",
  total: 12_500,
  buyerTaxStatusCode: 5,
  saleEvent: SALE_EVENT,
};

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-01T08:00:00.000Z"),
  expiresAt: new Date("2026-10-01T20:00:00.000Z"),
};

function setup() {
  const documents = new FakePointOfSaleLanes([[12, REGISTER_ID]]);
  const store = new FakeUnclearOutcomeStore(documents);
  const ports = { lanes: store, clock: new ManualClock(NOW) };
  return { documents, store, ports };
}

describe("askAboutUnclearOutcome", () => {
  it("records a document the cloud has no record of as abandoned, in the point of sale's lane, and answers it is pending", async () => {
    const { documents, store, ports } = setup();

    expect(
      await askAboutUnclearOutcome(ports, { registerId: REGISTER_ID, request: REQUEST }),
    ).toEqual({ kind: "pending" });
    expect(documents.lanesEntered).toEqual([12]);
    expect(documents.operations).toEqual([
      "enterLane",
      "registerOwnsPointOfSale",
      "recordedRequest",
      "recordAbandonedRequest@2026-10-01T12:00:00.000Z",
      "leaveLane",
    ]);
    expect(documents.requests.get(FISCAL_DOCUMENT_ID)).toMatchObject({
      registerId: REGISTER_ID,
      saleId: "sale-1",
      pointOfSale: 12,
      number: 41,
      issuedOn: "2026-10-01",
      total: 12_500,
      buyerTaxStatusCode: 5,
      saleEvent: SALE_EVENT,
    });
    expect(documents.answers.get(FISCAL_DOCUMENT_ID)).toEqual({ kind: "unclear" });
    expect(store.answeredAt.get(FISCAL_DOCUMENT_ID)).toEqual(NOW);
  });

  it("never lets a later authorization request for the recorded document reach the tax authority", async () => {
    const { documents, ports } = setup();
    await askAboutUnclearOutcome(ports, { registerId: REGISTER_ID, request: REQUEST });
    const taxAuthority = new FakeTaxAuthorityInvoicing(documents, {
      kind: "authorized",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-11",
    });

    const outcome = await authorizeFiscalDocument(
      {
        lanes: documents,
        clock: ports.clock,
        tokens: new FakeWsaaTokenSource(documents, TOKEN),
        taxAuthority,
      },
      {
        registerId: REGISTER_ID,
        request: { ...REQUEST, timeoutMs: 5_000, roundTripMedianMs: 200 },
        receivedAt: NOW,
      },
    );

    expect(outcome).toEqual({ kind: "already_answered", answer: { kind: "unclear" } });
    expect(taxAuthority.solicitations).toEqual([]);
  });

  it("refuses a point of sale the register does not own, recording nothing", async () => {
    const { documents, ports } = setup();

    expect(
      await askAboutUnclearOutcome(ports, {
        registerId: "register-2",
        request: REQUEST,
      }),
    ).toEqual({ kind: "point_of_sale_not_owned" });
    expect(documents.requests.size).toBe(0);
  });

  it("refuses a sale event that does not complete the document's sale, before taking the lane", async () => {
    const { documents, ports } = setup();

    expect(
      await askAboutUnclearOutcome(ports, {
        registerId: REGISTER_ID,
        request: { ...REQUEST, saleId: "sale-2" },
      }),
    ).toEqual({ kind: "sale_event_mismatch" });
    expect(documents.lanesEntered).toEqual([]);
  });

  it("answers an already recorded document with the decision recorded for it and records nothing more", async () => {
    const { documents, store, ports } = setup();
    store.seed(
      {
        ...REQUEST,
        registerId: REGISTER_ID,
        notAfter: NOW,
        receivedAt: NOW,
      },
      { kind: "unclear" },
      NOW,
      { kind: "released" },
    );

    expect(
      await askAboutUnclearOutcome(ports, { registerId: REGISTER_ID, request: REQUEST }),
    ).toEqual({ kind: "decided", decision: { kind: "released" } });
    expect(documents.operations).not.toContain("recordAbandonedRequest@2026-10-01T12:00:00.000Z");
  });

  it("answers a document the tax authority authorized with that authorization, recording nothing more", async () => {
    const { documents, store, ports } = setup();
    store.seed(
      { ...REQUEST, registerId: REGISTER_ID, notAfter: NOW, receivedAt: NOW },
      {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
      NOW,
    );

    expect(
      await askAboutUnclearOutcome(ports, { registerId: REGISTER_ID, request: REQUEST }),
    ).toEqual({
      kind: "answered",
      answer: {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    });
    expect(documents.operations).not.toContain("recordAbandonedRequest@2026-10-01T12:00:00.000Z");
    expect(store.decisions.size).toBe(0);
  });

  it("answers a document the tax authority rejected with that rejection, recording nothing more", async () => {
    const { documents, store, ports } = setup();
    store.seed(
      { ...REQUEST, registerId: REGISTER_ID, notAfter: NOW, receivedAt: NOW },
      { kind: "rejected", codes: [10015], rejectionClass: "content" },
      NOW,
    );

    expect(
      await askAboutUnclearOutcome(ports, { registerId: REGISTER_ID, request: REQUEST }),
    ).toEqual({
      kind: "answered",
      answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
    });
    expect(documents.operations).not.toContain("recordAbandonedRequest@2026-10-01T12:00:00.000Z");
    expect(store.decisions.size).toBe(0);
  });

  it("answers an already recorded document that is still undecided as pending", async () => {
    const { store, ports } = setup();
    store.seed({ ...REQUEST, registerId: REGISTER_ID, notAfter: NOW, receivedAt: NOW }, null);

    expect(
      await askAboutUnclearOutcome(ports, { registerId: REGISTER_ID, request: REQUEST }),
    ).toEqual({ kind: "pending" });
  });

  it("refuses a document recorded for another register, leaving it untouched", async () => {
    const { documents, store, ports } = setup();
    store.seed({ ...REQUEST, registerId: "register-2", notAfter: NOW, receivedAt: NOW }, null);

    expect(
      await askAboutUnclearOutcome(ports, { registerId: REGISTER_ID, request: REQUEST }),
    ).toEqual({ kind: "fiscal_document_not_owned" });
    expect(documents.requests.get(FISCAL_DOCUMENT_ID)?.registerId).toBe("register-2");
  });

  it("lets an unexpected recording failure through", async () => {
    const { store, ports } = setup();
    const failure = new Error("storage unavailable");
    store.recordingFailure = failure;

    await expect(
      askAboutUnclearOutcome(ports, { registerId: REGISTER_ID, request: REQUEST }),
    ).rejects.toBe(failure);
  });
});
