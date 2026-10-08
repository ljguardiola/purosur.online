import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import { authorizeFiscalDocument } from "./authorize-fiscal-document.js";
import type { SolicitationAnswer } from "./fiscal-document-authorization-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeInvoicingEvidence,
  FakePointOfSaleLanes,
  FakeTaxAuthorityInvoicing,
  FakeWsaaTokenSource,
} from "./test-support/fake-fiscal-document-authorization.js";

const RECEIVED_AT = new Date("2026-10-01T12:00:00.000Z");
const ANSWER_DELAY_MS = 900;
const REGISTER_ID = "register-1";
const FISCAL_DOCUMENT_ID = "fiscal-document-1";
const NOT_AFTER = new Date("2026-10-01T12:00:04.400Z");

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
  timeoutMs: 5_000,
  roundTripMedianMs: 200,
  saleEvent: SALE_EVENT,
};

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-01T08:00:00.000Z"),
  expiresAt: new Date("2026-10-01T20:00:00.000Z"),
};

const AUTHORIZED_BY_ARCA: SolicitationAnswer = {
  kind: "authorized",
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-11",
};

const AUTHORIZED_ANSWER = {
  kind: "authorized",
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-11",
} as const;

interface Scenario {
  owners?: [number, string][];
  token?: typeof TOKEN | null;
  solicitation?: SolicitationAnswer;
  request?: Partial<typeof REQUEST>;
  startAt?: Date;
  seeded?: {
    answer: Parameters<FakePointOfSaleLanes["seedRequest"]>[1];
    registerId?: string;
  };
}

function authorize({
  owners = [[12, REGISTER_ID]],
  token = TOKEN,
  solicitation = AUTHORIZED_BY_ARCA,
  request = {},
  startAt = RECEIVED_AT,
  seeded,
}: Scenario = {}) {
  const clock = new ManualClock(startAt);
  const lanes = new FakePointOfSaleLanes(owners);
  if (seeded) {
    lanes.seedRequest(
      {
        fiscalDocumentId: FISCAL_DOCUMENT_ID,
        registerId: seeded.registerId ?? REGISTER_ID,
        saleId: "sale-1",
        pointOfSale: 12,
        number: 41,
        issuedOn: "2026-10-01",
        total: 12_500,
        buyerTaxStatusCode: 5,
        notAfter: NOT_AFTER,
        saleEvent: SALE_EVENT,
        receivedAt: RECEIVED_AT,
      },
      seeded.answer,
    );
  }
  const tokens = new FakeWsaaTokenSource(lanes, token);
  const taxAuthority = new FakeTaxAuthorityInvoicing(lanes, solicitation, () =>
    clock.advanceBy(ANSWER_DELAY_MS),
  );
  const evidence = new FakeInvoicingEvidence();
  const outcome = authorizeFiscalDocument(
    { lanes, clock, tokens, taxAuthority, evidence },
    { registerId: REGISTER_ID, request: { ...REQUEST, ...request }, receivedAt: RECEIVED_AT },
  );
  return { lanes, taxAuthority, evidence, outcome };
}

describe("authorizeFiscalDocument", () => {
  it("records the request with its sale event and deadline, then solicits the tax authority, inside the point of sale's lane", async () => {
    const { lanes, taxAuthority, outcome } = authorize();
    await outcome;

    expect(lanes.operations.slice(0, 7)).toEqual([
      "enterLane",
      "registerOwnsPointOfSale",
      "recordedRequest",
      "recordRequest",
      "validToken",
      "solicit",
      expect.stringMatching(/^recordAnswer:/),
    ]);
    expect(lanes.requests.get(FISCAL_DOCUMENT_ID)).toEqual({
      fiscalDocumentId: FISCAL_DOCUMENT_ID,
      registerId: REGISTER_ID,
      saleId: "sale-1",
      pointOfSale: 12,
      number: 41,
      issuedOn: "2026-10-01",
      total: 12_500,
      buyerTaxStatusCode: 5,
      notAfter: NOT_AFTER,
      saleEvent: SALE_EVENT,
      receivedAt: RECEIVED_AT,
    });
    expect(lanes.lanesEntered).toEqual([12]);
    expect(taxAuthority.heldLaneDuringSolicit).toBe(true);
    expect(lanes.operations.at(-1)).toBe("leaveLane");
  });

  it("solicits the tax authority with the token and the document's data", async () => {
    const { taxAuthority, outcome } = authorize();
    await outcome;

    expect(taxAuthority.solicitations).toEqual([
      {
        token: TOKEN,
        pointOfSale: 12,
        number: 41,
        issuedOn: "2026-10-01",
        total: 12_500,
        buyerTaxStatusCode: 5,
      },
    ]);
  });

  it("answers authorized, records the answer when it arrived and the call as evidence of reachability", async () => {
    const { lanes, evidence, outcome } = authorize();
    const answeredAt = new Date(RECEIVED_AT.getTime() + ANSWER_DELAY_MS);

    await expect(outcome).resolves.toEqual({ kind: "answered", answer: AUTHORIZED_ANSWER });
    expect(lanes.answers.get(FISCAL_DOCUMENT_ID)).toEqual(AUTHORIZED_ANSWER);
    expect(lanes.operations).toContain(`recordAnswer:authorized@${answeredAt.toISOString()}`);
    expect(evidence.okAt).toEqual([answeredAt]);
  });

  it("answers rejected with the codes and still counts the call as evidence of reachability", async () => {
    const { lanes, evidence, outcome } = authorize({
      solicitation: { kind: "rejected", codes: [10015, 10048] },
    });

    await expect(outcome).resolves.toEqual({
      kind: "answered",
      answer: { kind: "rejected", codes: [10015, 10048] },
    });
    expect(lanes.answers.get(FISCAL_DOCUMENT_ID)).toEqual({
      kind: "rejected",
      codes: [10015, 10048],
    });
    expect(evidence.okAt).toHaveLength(1);
  });

  it("answers unclear, not rejected, when the number or date does not follow the last authorized, and still counts the call as evidence", async () => {
    const { lanes, evidence, outcome } = authorize({
      solicitation: { kind: "rejected", codes: [10016] },
    });

    await expect(outcome).resolves.toEqual({ kind: "answered", answer: { kind: "unclear" } });
    expect(lanes.answers.get(FISCAL_DOCUMENT_ID)).toEqual({ kind: "unclear" });
    expect(evidence.okAt).toHaveLength(1);
  });

  it("answers unclear and counts no evidence when the tax authority gave no answer", async () => {
    const { lanes, evidence, outcome } = authorize({ solicitation: { kind: "no_answer" } });

    await expect(outcome).resolves.toEqual({ kind: "answered", answer: { kind: "unclear" } });
    expect(lanes.answers.get(FISCAL_DOCUMENT_ID)).toEqual({ kind: "unclear" });
    expect(evidence.okAt).toEqual([]);
  });

  it("refuses a point of sale the register does not own, recording and calling nothing", async () => {
    const { lanes, taxAuthority, outcome } = authorize({ owners: [[12, "register-2"]] });

    await expect(outcome).resolves.toEqual({ kind: "point_of_sale_not_owned" });
    expect(lanes.operations).toEqual(["enterLane", "registerOwnsPointOfSale", "leaveLane"]);
    expect(taxAuthority.solicitations).toEqual([]);
  });

  it("refuses a point of sale nobody owns", async () => {
    const { outcome } = authorize({ owners: [] });

    await expect(outcome).resolves.toEqual({ kind: "point_of_sale_not_owned" });
  });

  it("refuses an event that is not the completion of the sale, before taking the lane", async () => {
    const { lanes, taxAuthority, outcome } = authorize({
      request: { saleEvent: { ...SALE_EVENT, aggregate_id: "sale-2" } },
    });

    await expect(outcome).resolves.toEqual({ kind: "sale_event_mismatch" });
    expect(lanes.operations).toEqual([]);
    expect(taxAuthority.solicitations).toEqual([]);
  });

  it("returns the answer already recorded for the document, without calling the tax authority again", async () => {
    const { lanes, taxAuthority, evidence, outcome } = authorize({
      seeded: { answer: AUTHORIZED_ANSWER },
    });

    await expect(outcome).resolves.toEqual({ kind: "answered", answer: AUTHORIZED_ANSWER });
    expect(lanes.operations).toEqual([
      "enterLane",
      "registerOwnsPointOfSale",
      "recordedRequest",
      "leaveLane",
    ]);
    expect(taxAuthority.solicitations).toEqual([]);
    expect(evidence.okAt).toEqual([]);
  });

  it("refuses a document id another register recorded, without reading its answer, recording anything or calling the tax authority", async () => {
    const { lanes, taxAuthority, evidence, outcome } = authorize({
      seeded: { answer: AUTHORIZED_ANSWER, registerId: "register-2" },
    });

    await expect(outcome).resolves.toEqual({ kind: "fiscal_document_not_owned" });
    expect(lanes.operations).toEqual([
      "enterLane",
      "registerOwnsPointOfSale",
      "recordedRequest",
      "leaveLane",
    ]);
    expect(lanes.requests.get(FISCAL_DOCUMENT_ID)?.registerId).toBe("register-2");
    expect(taxAuthority.solicitations).toEqual([]);
    expect(evidence.okAt).toEqual([]);
  });

  it("answers unclear for a document whose earlier request has no answer, without calling the tax authority", async () => {
    const { lanes, taxAuthority, outcome } = authorize({ seeded: { answer: null } });

    await expect(outcome).resolves.toEqual({ kind: "answered", answer: { kind: "unclear" } });
    expect(lanes.operations).not.toContain("recordRequest");
    expect(lanes.answers.has(FISCAL_DOCUMENT_ID)).toBe(false);
    expect(taxAuthority.solicitations).toEqual([]);
  });

  it("starts the call at the deadline itself", async () => {
    const { taxAuthority, outcome } = authorize({ startAt: NOT_AFTER });
    await outcome;

    expect(taxAuthority.solicitations).toHaveLength(1);
  });

  it("records the call as not attempted and makes none once the deadline has passed", async () => {
    const { lanes, taxAuthority, evidence, outcome } = authorize({
      startAt: new Date(NOT_AFTER.getTime() + 1),
    });

    await expect(outcome).resolves.toEqual({
      kind: "answered",
      answer: { kind: "not_attempted" },
    });
    expect(lanes.requests.has(FISCAL_DOCUMENT_ID)).toBe(true);
    expect(lanes.answers.get(FISCAL_DOCUMENT_ID)).toEqual({ kind: "not_attempted" });
    expect(taxAuthority.solicitations).toEqual([]);
    expect(evidence.okAt).toEqual([]);
  });

  it("computes the deadline from the budget and the round trip the request carries", async () => {
    const { lanes, outcome } = authorize({
      request: { timeoutMs: 3_000, roundTripMedianMs: 101 },
    });
    await outcome;

    expect(lanes.requests.get(FISCAL_DOCUMENT_ID)?.notAfter).toEqual(
      new Date("2026-10-01T12:00:02.449Z"),
    );
  });

  it("records the call as not attempted and makes none without a valid token", async () => {
    const { lanes, taxAuthority, outcome } = authorize({ token: null });

    await expect(outcome).resolves.toEqual({
      kind: "answered",
      answer: { kind: "not_attempted" },
    });
    expect(lanes.answers.get(FISCAL_DOCUMENT_ID)).toEqual({ kind: "not_attempted" });
    expect(taxAuthority.solicitations).toEqual([]);
  });
});
