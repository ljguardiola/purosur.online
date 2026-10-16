import { describe, expect, it } from "vitest";
import type {
  LocalRequestAtNumber,
  RequestsAtNumber,
  SaleDocument,
} from "../model/orphan-authorization.js";
import {
  type TaxAuthorityVoucher,
  UNCLEAR_OUTCOME_REASK_INTERVAL_MS,
} from "../model/unclear-outcome-decision.js";
import { regularizeOrphanAuthorization } from "./regularize-orphan-authorization.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeOrphanRegularizationStore,
  FakeOrphanRegularizationTokens,
  FakeOrphanRegularizationVouchers,
} from "./test-support/fake-orphan-regularization.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";
import type { VoucherAnswer } from "./unclear-outcome-ports.js";

const NOW = new Date("2026-10-02T15:00:00.000Z");
const RETRY = {
  kind: "retry",
  askAgainAt: new Date(NOW.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
};

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-02T08:00:00.000Z"),
  expiresAt: new Date("2026-10-02T20:00:00.000Z"),
};

const VOUCHER: TaxAuthorityVoucher = {
  issuedOn: "2026-10-01",
  total: 12_500,
  documentType: 11,
  receiverDocumentType: 99,
  receiverDocumentNumber: 0,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-11",
};

const SALE_REQUEST: LocalRequestAtNumber = {
  fiscalDocumentId: "document-1",
  saleId: "sale-1",
  issuedOn: VOUCHER.issuedOn,
  total: VOUCHER.total,
  buyerTaxStatusCode: VOUCHER.receiverTaxStatusCode,
  answer: { kind: "unclear" },
};

const requestsAt = (...requests: LocalRequestAtNumber[]): RequestsAtNumber => ({
  kind: "requests",
  requests,
});

const KEPT_DOCUMENTS: SaleDocument[] = [
  { kind: "offline", voucher: { voucherType: 11, pointOfSale: 13, number: 7 } },
];

interface Scenario {
  token?: typeof TOKEN | null;
  voucher?: VoucherAnswer;
  standing?: RequestsAtNumber;
  saleDocuments?: SaleDocument[];
}

function scenario({
  token = TOKEN,
  voucher = { kind: "found", voucher: VOUCHER },
  standing,
  saleDocuments,
}: Scenario = {}) {
  const store = new FakeOrphanRegularizationStore();
  if (standing !== undefined) {
    store.seedRequestsAtNumber({ pointOfSale: 12, number: 41 }, standing);
  }
  if (saleDocuments !== undefined) {
    store.seedSaleDocuments("sale-1", saleDocuments);
  }
  const vouchers = new FakeOrphanRegularizationVouchers(store, voucher);
  const ports = {
    lanes: store,
    clock: new ManualClock(NOW),
    ids: new SequentialIds(),
    tokens: new FakeOrphanRegularizationTokens(store, token),
    vouchers,
  };
  return { store, vouchers, ports };
}

function regularize(ports: ReturnType<typeof scenario>["ports"]) {
  return regularizeOrphanAuthorization(ports, { pointOfSale: 12, number: 41 });
}

describe("regularizeOrphanAuthorization", () => {
  it("corrects with a credit note an authorization of a sale that has another authorized voucher", async () => {
    const { store, ports } = scenario({
      standing: requestsAt(SALE_REQUEST),
      saleDocuments: KEPT_DOCUMENTS,
    });

    const outcome = await regularize(ports);

    const regularization = {
      kind: "credit_note",
      creditNoteId: "id-1",
      saleId: "sale-1",
      pointOfSale: 12,
      associatedVoucher: { voucherType: 11, pointOfSale: 12, number: 41 },
      keptVoucher: { voucherType: 11, pointOfSale: 13, number: 7 },
      total: 12_500,
      receiverTaxStatusCode: 5,
    };
    expect(outcome).toEqual({ kind: "regularized", regularization });
    expect(store.regularizations).toEqual([regularization]);
  });

  it("opens an alert and a task for a person for an authorization no sale stands behind", async () => {
    const { store, ports } = scenario();

    const outcome = await regularize(ports);

    const regularization = {
      kind: "external_invoicing",
      externalBilling: { pointOfSale: 12, documentType: "factura_c", number: 41 },
      task: {
        kind: "external_invoicing",
        state: "open",
        pointOfSale: 12,
        documentType: "factura_c",
        number: 41,
        voucher: { issuedOn: "2026-10-01", total: 12_500, authorizationCode: "75123456789012" },
        createdAt: NOW,
      },
    };
    expect(outcome).toEqual({ kind: "regularized", regularization });
    expect(store.regularizations).toEqual([regularization]);
  });

  it.each<[string, RequestsAtNumber]>([
    ["the only voucher of its sale", requestsAt(SALE_REQUEST)],
    ["already regularized", { kind: "already_regularized" }],
  ])("regularizes nothing for an authorization that is %s", async (_case, standing) => {
    const { store, ports } = scenario({ standing });

    expect(await regularize(ports)).toEqual({ kind: "nothing_to_regularize" });
    expect(store.regularizations).toEqual([]);
  });

  it("does not look at the sales nor regularize when the tax authority shows no voucher", async () => {
    const { store, ports } = scenario({ voucher: { kind: "none" } });

    expect(await regularize(ports)).toEqual({ kind: "not_confirmed" });
    expect(store.operations).not.toContain("requestsAtNumber");
    expect(store.regularizations).toEqual([]);
  });

  it.each<[string, Scenario]>([
    ["the tax authority does not answer", { voucher: { kind: "no_answer" } }],
    ["there is no valid token", { token: null }],
  ])("asks again later when %s, regularizing nothing", async (_case, change) => {
    const { store, vouchers, ports } = scenario(change);

    expect(await regularize(ports)).toEqual(RETRY);
    expect(store.regularizations).toEqual([]);
    if (change.token === null) {
      expect(vouchers.lookups).toEqual([]);
    }
  });

  it("confirms the factura C at the point of sale and number inside the point of sale's lane, then reads the sales and records, in that order", async () => {
    const { store, vouchers, ports } = scenario({
      standing: requestsAt(SALE_REQUEST),
      saleDocuments: KEPT_DOCUMENTS,
    });

    await regularize(ports);

    expect(vouchers.lookups).toEqual([{ pointOfSale: 12, voucherType: 11, number: 41 }]);
    expect(vouchers.heldLane).toBe(true);
    expect(store.saleDocumentAsks).toEqual([{ saleId: "sale-1", fiscalDocumentId: "document-1" }]);
    expect(store.operations).toEqual([
      "enterLane",
      "validToken",
      "voucherAt",
      "requestsAtNumber",
      "otherDocumentsOfSale",
      "recordOrphanRegularization",
      "leaveLane",
    ]);
  });
});
