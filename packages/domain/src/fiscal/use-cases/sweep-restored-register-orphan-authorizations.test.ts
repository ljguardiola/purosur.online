import { describe, expect, it } from "vitest";
import { FACTURA_C_VOUCHER_TYPE } from "../model/factura-c-fiscal-block.js";
import type { SaleDocument } from "../model/orphan-authorization.js";
import { sweepRestoredRegisterOrphanAuthorizations } from "./sweep-restored-register-orphan-authorizations.js";
import type { UnrecordedSaleRequest } from "./sweep-restored-register-orphan-authorizations-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import { FakeRestoredRegisterOrphanSweep } from "./test-support/fake-restored-register-orphan-sweep.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");

const AUTHORIZED_OUTCOME = {
  answer: {
    kind: "authorized" as const,
    authorizationCode: "75123456789012",
    authorizationCodeDueOn: "2026-10-11",
  },
  decision: null,
};

const request = (
  number: number,
  overrides: Partial<UnrecordedSaleRequest> = {},
): UnrecordedSaleRequest => ({
  fiscalDocumentId: `document-${number}`,
  saleId: `sale-${number}`,
  number,
  issuedOn: "2026-10-01",
  total: 12_500,
  buyerTaxStatusCode: 5,
  outcome: AUTHORIZED_OUTCOME,
  ...overrides,
});

const OTHER_VOUCHER = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 13, number: 7 };
const OTHER_DOCUMENT: SaleDocument = { kind: "offline", voucher: OTHER_VOUCHER };

function scenario(pointsOfSale: number[] = [12]) {
  const store = new FakeRestoredRegisterOrphanSweep();
  store.seedPointsOfSale("register-1", pointsOfSale);
  const ports = {
    points: store,
    lanes: store,
    clock: new ManualClock(NOW),
    ids: new SequentialIds(),
  };
  return { store, ports };
}

function sweep(ports: ReturnType<typeof scenario>["ports"]) {
  return sweepRestoredRegisterOrphanAuthorizations(ports, { registerId: "register-1" });
}

describe("sweepRestoredRegisterOrphanAuthorizations", () => {
  it("requests a credit note for an authorized request whose sale has another authorized receipt", async () => {
    const { store, ports } = scenario();
    store.seedUnrecordedRequests(12, [request(41)]);
    store.seedSaleDocuments("sale-41", [OTHER_DOCUMENT]);

    expect(await sweep(ports)).toEqual({
      kind: "swept",
      creditNotedNumbers: [41],
      alertedNumbers: [],
    });
    expect(store.regularizations).toEqual([
      {
        kind: "credit_note",
        creditNoteId: "id-1",
        saleId: "sale-41",
        pointOfSale: 12,
        associatedVoucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 12, number: 41 },
        keptVoucher: OTHER_VOUCHER,
        total: 12_500,
        receiverTaxStatusCode: 5,
      },
    ]);
  });

  it("alerts a person and opens a task, issuing no credit note, for an authorized request with no other receipt", async () => {
    const { store, ports } = scenario();
    store.seedUnrecordedRequests(12, [request(41)]);

    expect(await sweep(ports)).toEqual({
      kind: "swept",
      creditNotedNumbers: [],
      alertedNumbers: [41],
    });
    expect(store.regularizations).toHaveLength(1);
    expect(store.regularizations[0]).toMatchObject({
      kind: "external_invoicing",
      externalBilling: { pointOfSale: 12, documentType: "factura_c", number: 41 },
      task: { kind: "external_invoicing" },
    });
  });

  it("leaves a request alone whose number was already regularized", async () => {
    const { store, ports } = scenario();
    store.seedUnrecordedRequests(12, [request(41)]);
    store.seedRequestsAtNumber({ pointOfSale: 12, number: 41 }, { kind: "already_regularized" });

    expect(await sweep(ports)).toEqual({
      kind: "swept",
      creditNotedNumbers: [],
      alertedNumbers: [],
    });
    expect(store.regularizations).toEqual([]);
  });

  it.each<[string, UnrecordedSaleRequest["outcome"]]>([
    ["has no answer yet", { answer: null, decision: null }],
    ["is still unclear", { answer: { kind: "unclear" }, decision: null }],
    [
      "was rejected",
      { answer: { kind: "rejected", codes: [10016], rejectionClass: "content" }, decision: null },
    ],
    ["was released", { answer: { kind: "unclear" }, decision: { kind: "released" } }],
  ])("leaves a request alone that %s", async (_case, outcome) => {
    const { store, ports } = scenario();
    store.seedUnrecordedRequests(12, [request(41, { outcome })]);

    expect(await sweep(ports)).toEqual({
      kind: "swept",
      creditNotedNumbers: [],
      alertedNumbers: [],
    });
    expect(store.regularizations).toEqual([]);
  });

  it("regularizes a request whose authorization was adopted after an unclear answer", async () => {
    const { store, ports } = scenario();
    store.seedUnrecordedRequests(12, [
      request(41, {
        outcome: {
          answer: { kind: "unclear" },
          decision: {
            kind: "adopted",
            authorizationCode: "75123456789012",
            authorizationCodeDueOn: "2026-10-11",
          },
        },
      }),
    ]);

    expect(await sweep(ports)).toEqual({
      kind: "swept",
      creditNotedNumbers: [],
      alertedNumbers: [41],
    });
  });

  it("finds nothing and changes nothing when no request is without its sale", async () => {
    const { store, ports } = scenario([12, 13]);

    expect(await sweep(ports)).toEqual({
      kind: "swept",
      creditNotedNumbers: [],
      alertedNumbers: [],
    });
    expect(store.regularizations).toEqual([]);
  });

  it("finds nothing for a register with no fiscal point of sale", async () => {
    const { store, ports } = scenario([]);

    expect(await sweep(ports)).toEqual({
      kind: "swept",
      creditNotedNumbers: [],
      alertedNumbers: [],
    });
    expect(store.operations).toEqual(["fiscalPointsOfSaleOf"]);
  });

  it("examines every request of every point of the register", async () => {
    const { store, ports } = scenario([12, 13]);
    store.seedUnrecordedRequests(12, [request(41), request(42), request(43)]);
    store.seedUnrecordedRequests(13, [request(7)]);
    store.seedSaleDocuments("sale-42", [OTHER_DOCUMENT]);

    expect(await sweep(ports)).toEqual({
      kind: "swept",
      creditNotedNumbers: [42],
      alertedNumbers: [41, 43, 7],
    });
    expect(store.regularizations.map(({ kind }) => kind)).toEqual([
      "external_invoicing",
      "credit_note",
      "external_invoicing",
      "external_invoicing",
    ]);
  });

  it("gives every credit note its own id", async () => {
    const { store, ports } = scenario();
    store.seedUnrecordedRequests(12, [request(41), request(42)]);
    store.seedSaleDocuments("sale-41", [OTHER_DOCUMENT]);
    store.seedSaleDocuments("sale-42", [OTHER_DOCUMENT]);

    await sweep(ports);

    expect(
      store.regularizations.flatMap((regularization) =>
        regularization.kind === "credit_note" ? [regularization.creditNoteId] : [],
      ),
    ).toEqual(["id-1", "id-2"]);
  });

  it("refuses to sweep, recording nothing, while the point of sale's numbering is not reconciled", async () => {
    const { store, ports } = scenario();
    store.seedFreeze(12, { countBeforeFreeze: 10, frozenAt: NOW });
    store.seedUnrecordedRequests(12, [request(41)]);

    expect(await sweep(ports)).toEqual({ kind: "numbering_not_reconciled" });
    expect(store.regularizations).toEqual([]);
    expect(store.operations).not.toContain("requestsWithoutRecordedSale");
  });

  it("refuses when any point of the register is not reconciled, without sweeping the ones after it", async () => {
    const { store, ports } = scenario([12, 13]);
    store.seedFreeze(12, { countBeforeFreeze: 10, frozenAt: NOW });
    store.seedUnrecordedRequests(13, [request(7)]);

    expect(await sweep(ports)).toEqual({ kind: "numbering_not_reconciled" });
    expect(store.regularizations).toEqual([]);
  });

  it("does the whole of a point of sale's work inside its lane", async () => {
    const { store, ports } = scenario([12, 13]);
    store.seedUnrecordedRequests(12, [request(41)]);

    await sweep(ports);

    expect(store.operations).toEqual([
      "fiscalPointsOfSaleOf",
      "enterLane:12",
      "numberingFreeze",
      "requestsWithoutRecordedSale",
      "requestsAtNumber",
      "otherDocumentsOfSale",
      "recordOrphanRegularization",
      "leaveLane:12",
      "enterLane:13",
      "numberingFreeze",
      "requestsWithoutRecordedSale",
      "leaveLane:13",
    ]);
  });
});
