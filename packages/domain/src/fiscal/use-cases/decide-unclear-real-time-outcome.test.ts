import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import {
  type TaxAuthorityVoucher,
  UNCLEAR_OUTCOME_REASK_INTERVAL_MS,
  UNCLEAR_OUTCOME_SETTLING_DELAY_MS,
} from "../model/unclear-outcome-decision.js";
import { decideUnclearRealTimeOutcome } from "./decide-unclear-real-time-outcome.js";
import type { AuthorizationRequestRecord } from "./fiscal-document-authorization-ports.js";
import type { LastAuthorizedAnswer } from "./tax-authority-count-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakePointOfSaleLanes,
  FakeWsaaTokenSource,
} from "./test-support/fake-fiscal-document-authorization.js";
import { FakeLastAuthorizedLookup } from "./test-support/fake-tax-authority-count.js";
import {
  FakeTaxAuthorityVouchers,
  FakeUnclearOutcomeStore,
} from "./test-support/fake-unclear-outcome.js";
import type { VoucherAnswer } from "./unclear-outcome-ports.js";

const FISCAL_DOCUMENT_ID = "fiscal-document-1";
const ABANDONED_AT = new Date("2026-10-01T12:00:00.000Z");
const SETTLED_AT = new Date(ABANDONED_AT.getTime() + UNCLEAR_OUTCOME_SETTLING_DELAY_MS);

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

const REQUEST: AuthorizationRequestRecord = {
  fiscalDocumentId: FISCAL_DOCUMENT_ID,
  registerId: "register-1",
  saleId: "sale-1",
  pointOfSale: 12,
  number: 41,
  issuedOn: "2026-10-01",
  total: 12_500,
  buyerTaxStatusCode: 5,
  notAfter: new Date("2026-10-01T11:59:59.000Z"),
  saleEvent: SALE_EVENT,
  receivedAt: new Date("2026-10-01T11:59:56.000Z"),
};

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-01T08:00:00.000Z"),
  expiresAt: new Date("2026-10-01T20:00:00.000Z"),
};

const MATCHING_VOUCHER: TaxAuthorityVoucher = {
  issuedOn: "2026-10-01",
  total: 12_500,
  documentType: 11,
  receiverDocumentType: 99,
  receiverDocumentNumber: 0,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-11",
};

interface Scenario {
  answer?: RealTimeAuthorizationAnswer | null;
  answeredAt?: Date | null;
  decision?: Parameters<FakeUnclearOutcomeStore["seed"]>[3];
  now?: Date;
  token?: typeof TOKEN | null;
  voucher?: VoucherAnswer;
  lastAuthorized?: LastAuthorizedAnswer;
}

function scenario({
  answer = { kind: "unclear" },
  answeredAt = ABANDONED_AT,
  decision = null,
  now = SETTLED_AT,
  token = TOKEN,
  voucher = { kind: "none" },
  lastAuthorized = { kind: "read", number: 40 },
}: Scenario = {}) {
  const documents = new FakePointOfSaleLanes([[12, "register-1"]]);
  const store = new FakeUnclearOutcomeStore(documents);
  store.seed(REQUEST, answer, answer === null ? null : answeredAt, decision);
  const clock = new ManualClock(now);
  const vouchers = new FakeTaxAuthorityVouchers(documents, voucher);
  const lastAuthorizedLookup = new FakeLastAuthorizedLookup(lastAuthorized);
  const ports = {
    requests: store,
    lanes: store,
    clock,
    tokens: new FakeWsaaTokenSource(documents, token),
    vouchers,
    taxAuthority: lastAuthorizedLookup,
  };
  return { documents, store, clock, vouchers, lastAuthorizedLookup, ports };
}

function decide(
  ports: ReturnType<typeof scenario>["ports"],
  fiscalDocumentId = FISCAL_DOCUMENT_ID,
) {
  return decideUnclearRealTimeOutcome(ports, { fiscalDocumentId });
}

describe("decideUnclearRealTimeOutcome", () => {
  it("reports a document the cloud has no record of", async () => {
    const { ports, documents } = scenario();

    expect(await decide(ports, "unknown")).toEqual({ kind: "not_found" });
    expect(documents.lanesEntered).toEqual([]);
  });

  it("reports a request that disappeared before its lane was taken", async () => {
    const { ports, store } = scenario();
    store.vanishAfterLookup = true;

    expect(await decide(ports)).toEqual({ kind: "not_found" });
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
  ])("does nothing for a request the tax authority %s", async (_name, answer) => {
    const { ports, documents, vouchers, lastAuthorizedLookup } = scenario({ answer });

    expect(await decide(ports)).toEqual({ kind: "not_unclear" });
    expect(documents.operations).toEqual(["enterLane", "unclearRequest", "leaveLane"]);
    expect(vouchers.lookups).toEqual([]);
    expect(lastAuthorizedLookup.lookups).toEqual([]);
  });

  it("reports the recorded decision of an already decided request and does nothing", async () => {
    const { ports, documents, vouchers } = scenario({
      decision: { kind: "adopted", authorizationCode: "1", authorizationCodeDueOn: "2026-10-11" },
    });

    expect(await decide(ports)).toEqual({
      kind: "already_decided",
      decision: { kind: "adopted", authorizationCode: "1", authorizationCodeDueOn: "2026-10-11" },
    });
    expect(documents.operations).toEqual(["enterLane", "unclearRequest", "leaveLane"]);
    expect(vouchers.lookups).toEqual([]);
  });

  it("releases at once a request recorded as not attempted, without asking the tax authority", async () => {
    const { ports, documents, store, vouchers, lastAuthorizedLookup } = scenario({
      answer: { kind: "not_attempted" },
      now: new Date("2026-10-01T12:00:05.000Z"),
    });

    expect(await decide(ports)).toEqual({ kind: "decided", decision: { kind: "released" } });
    expect(documents.operations).toEqual([
      "enterLane",
      "unclearRequest",
      "recordDecision:released@2026-10-01T12:00:05.000Z",
      "leaveLane",
    ]);
    expect(store.decisions.get(FISCAL_DOCUMENT_ID)?.decision).toEqual({ kind: "released" });
    expect(vouchers.lookups).toEqual([]);
    expect(lastAuthorizedLookup.lookups).toEqual([]);
  });

  it("abandons a request with no answer, in its lane and before asking anything, and asks again once it settles", async () => {
    const { ports, documents, store, vouchers } = scenario({ answer: null, now: ABANDONED_AT });

    expect(await decide(ports)).toEqual({ kind: "pending", askAgainAt: SETTLED_AT });
    expect(documents.lanesEntered).toEqual([12]);
    expect(documents.operations).toEqual([
      "enterLane",
      "unclearRequest",
      "recordAbandonment@2026-10-01T12:00:00.000Z",
      "leaveLane",
    ]);
    expect(store.answeredAt.get(FISCAL_DOCUMENT_ID)).toEqual(ABANDONED_AT);
    expect(vouchers.lookups).toEqual([]);
  });

  it("keeps the abandonment moment when the same request is asked about again", async () => {
    const { ports, clock, store, documents } = scenario({ answer: null, now: ABANDONED_AT });
    await decide(ports);
    clock.advanceBy(UNCLEAR_OUTCOME_SETTLING_DELAY_MS);

    expect(await decide(ports)).toEqual({ kind: "decided", decision: { kind: "released" } });
    expect(store.answeredAt.get(FISCAL_DOCUMENT_ID)).toEqual(ABANDONED_AT);
    expect(documents.operations.filter((op) => op.startsWith("recordAbandonment"))).toHaveLength(1);
  });

  it("asks the tax authority nothing before the settling delay passed", async () => {
    const { ports, documents, vouchers, lastAuthorizedLookup } = scenario({
      now: new Date(SETTLED_AT.getTime() - 1),
    });

    expect(await decide(ports)).toEqual({ kind: "pending", askAgainAt: SETTLED_AT });
    expect(documents.operations).toEqual(["enterLane", "unclearRequest", "leaveLane"]);
    expect(vouchers.lookups).toEqual([]);
    expect(lastAuthorizedLookup.lookups).toEqual([]);
  });

  it("releases the number when the tax authority holds no voucher and its last authorized number is below it", async () => {
    const { ports, documents, store, vouchers, lastAuthorizedLookup } = scenario();

    expect(await decide(ports)).toEqual({ kind: "decided", decision: { kind: "released" } });
    expect(documents.operations).toEqual([
      "enterLane",
      "unclearRequest",
      "validToken",
      "voucherAt",
      "recordDecision:released@2026-10-01T12:01:00.000Z",
      "leaveLane",
    ]);
    expect(vouchers.lookups).toEqual([
      { token: TOKEN, pointOfSale: 12, voucherType: 11, number: 41 },
    ]);
    expect(lastAuthorizedLookup.lookups).toEqual([
      { token: TOKEN, pointOfSale: 12, voucherType: 11 },
    ]);
    expect(store.decisions.get(FISCAL_DOCUMENT_ID)?.decision).toEqual({ kind: "released" });
  });

  it("asks the tax authority while holding the point of sale's lane", async () => {
    const { ports, vouchers } = scenario();

    await decide(ports);

    expect(vouchers.heldLaneDuringLookup).toBe(true);
  });

  it("adopts the authorization of a voucher with the document's content, without reading the last authorized number", async () => {
    const { ports, store, lastAuthorizedLookup } = scenario({
      voucher: { kind: "found", voucher: MATCHING_VOUCHER },
    });

    expect(await decide(ports)).toEqual({
      kind: "decided",
      decision: {
        kind: "adopted",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    });
    expect(store.decisions.get(FISCAL_DOCUMENT_ID)?.decision.kind).toBe("adopted");
    expect(lastAuthorizedLookup.lookups).toEqual([]);
  });

  it.each<[string, Scenario, string]>([
    ["a request recorded as not attempted", { answer: { kind: "not_attempted" } }, "released"],
    ["no voucher below the last authorized number", {}, "released"],
    [
      "a voucher with the document's content",
      { voucher: { kind: "found", voucher: MATCHING_VOUCHER } },
      "adopted",
    ],
    [
      "a voucher with other content",
      { voucher: { kind: "found", voucher: { ...MATCHING_VOUCHER, total: 1 } } },
      "conflicting",
    ],
  ])(
    "records the decision together with clearing the document's warning, for %s",
    async (_name, change, decision) => {
      const { ports, documents, store } = scenario(change);

      await decide(ports);

      expect(store.clearedWarnings).toEqual([
        {
          decision,
          fiscalDocumentId: FISCAL_DOCUMENT_ID,
          clearedAt: SETTLED_AT,
        },
      ]);
      expect(documents.operations.filter((op) => op.startsWith("recordDecision"))).toHaveLength(1);
    },
  );

  it("clears no warning for a request that was already decided or is not unclear", async () => {
    const decided = scenario({ decision: { kind: "released" } });
    await decide(decided.ports);
    const answered = scenario({
      answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
    });
    await decide(answered.ports);

    expect(decided.store.clearedWarnings).toEqual([]);
    expect(answered.store.clearedWarnings).toEqual([]);
  });

  it("records a voucher with other content as conflicting", async () => {
    const { ports, store } = scenario({
      voucher: { kind: "found", voucher: { ...MATCHING_VOUCHER, total: 1 } },
    });

    expect(await decide(ports)).toEqual({ kind: "decided", decision: { kind: "conflicting" } });
    expect(store.decisions.get(FISCAL_DOCUMENT_ID)?.decision).toEqual({ kind: "conflicting" });
  });

  it.each<[string, Scenario]>([
    [
      "no voucher but the last authorized number reached the number",
      { lastAuthorized: { kind: "read", number: 41 } },
    ],
    ["the last authorized number unread", { lastAuthorized: { kind: "no_answer" } }],
    ["the voucher lookup unanswered", { voucher: { kind: "no_answer" } }],
    ["no valid token", { token: null }],
  ])("keeps the request pending, asking again in 30 seconds, with %s", async (_name, change) => {
    const { ports, store, documents } = scenario(change);

    expect(await decide(ports)).toEqual({
      kind: "pending",
      askAgainAt: new Date(SETTLED_AT.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
    });
    expect(store.decisions.size).toBe(0);
    expect(documents.operations.some((op) => op.startsWith("recordDecision"))).toBe(false);
    expect(store.clearedWarnings).toEqual([]);
  });

  it("does not look up a voucher or the last authorized number without a token", async () => {
    const { ports, vouchers, lastAuthorizedLookup } = scenario({ token: null });

    await decide(ports);

    expect(vouchers.lookups).toEqual([]);
    expect(lastAuthorizedLookup.lookups).toEqual([]);
  });

  it("does not read the last authorized number when the voucher lookup gave no answer", async () => {
    const { ports, lastAuthorizedLookup } = scenario({ voucher: { kind: "no_answer" } });

    await decide(ports);

    expect(lastAuthorizedLookup.lookups).toEqual([]);
  });
});
