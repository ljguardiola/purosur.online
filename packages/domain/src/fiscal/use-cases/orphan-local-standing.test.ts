import { describe, expect, it } from "vitest";
import type {
  LocalRequestAtNumber,
  RequestsAtNumber,
  SaleDocument,
} from "../model/orphan-authorization.js";
import type { TaxAuthorityVoucher } from "../model/unclear-outcome-decision.js";
import { localStandingBehindVoucher } from "./orphan-local-standing.js";
import { FakeOrphanRegularizationStore } from "./test-support/fake-orphan-regularization.js";

const AUTHORIZATION = { pointOfSale: 12, number: 41 };

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

const KEPT_VOUCHER = { voucherType: 11, pointOfSale: 13, number: 7 };

const requestsAt = (...requests: LocalRequestAtNumber[]): RequestsAtNumber => ({
  kind: "requests",
  requests,
});

function standingOf(
  standing: RequestsAtNumber | undefined,
  saleDocuments: [string, SaleDocument[]][] = [],
) {
  const store = new FakeOrphanRegularizationStore();
  if (standing !== undefined) {
    store.seedRequestsAtNumber(AUTHORIZATION, standing);
  }
  for (const [saleId, documents] of saleDocuments) {
    store.seedSaleDocuments(saleId, documents);
  }
  const answer = store.inPointOfSaleLane(AUTHORIZATION.pointOfSale, (lane) =>
    localStandingBehindVoucher(lane, AUTHORIZATION, VOUCHER),
  );
  return { store, answer };
}

describe("localStandingBehindVoucher", () => {
  it("answers already regularized without reading any sale", async () => {
    const { store, answer } = standingOf({ kind: "already_regularized" });

    expect(await answer).toEqual({ kind: "already_regularized" });
    expect(store.saleDocumentAsks).toEqual([]);
  });

  it.each<[string, RequestsAtNumber | undefined]>([
    ["no local request is at the number", undefined],
    [
      "the local request at the number has other content",
      requestsAt({ ...SALE_REQUEST, total: 1 }),
    ],
    [
      "the tax authority rejected the matching local request",
      requestsAt({
        ...SALE_REQUEST,
        answer: { kind: "rejected", codes: [10016], rejectionClass: "content" },
      }),
    ],
  ])("answers no local sale, without reading any sale, when %s", async (_case, standing) => {
    const { store, answer } = standingOf(standing, [
      ["sale-1", [{ kind: "offline", voucher: KEPT_VOUCHER }]],
    ]);

    expect(await answer).toEqual({ kind: "no_local_sale" });
    expect(store.saleDocumentAsks).toEqual([]);
  });

  it("answers the sale of the matching request among several, with the other voucher it holds", async () => {
    const { store, answer } = standingOf(
      requestsAt(
        { ...SALE_REQUEST, fiscalDocumentId: "document-8", saleId: "sale-8", total: 1 },
        SALE_REQUEST,
      ),
      [
        ["sale-8", [{ kind: "offline", voucher: { ...KEPT_VOUCHER, number: 8 } }]],
        ["sale-1", [{ kind: "offline", voucher: KEPT_VOUCHER }]],
      ],
    );

    expect(await answer).toEqual({
      kind: "local_sale",
      saleId: "sale-1",
      otherAuthorizedVoucher: KEPT_VOUCHER,
    });
    expect(store.saleDocumentAsks).toEqual([{ saleId: "sale-1", fiscalDocumentId: "document-1" }]);
  });

  it("answers a local sale with no other voucher when the sale holds no other authorized one", async () => {
    const { answer } = standingOf(requestsAt(SALE_REQUEST));

    expect(await answer).toEqual({
      kind: "local_sale",
      saleId: "sale-1",
      otherAuthorizedVoucher: null,
    });
  });
});
