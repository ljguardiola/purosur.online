import { describe, expect, it } from "vitest";
import { FACTURA_C_VOUCHER_TYPE } from "./factura-c-fiscal-block.js";
import {
  decideOrphanAuthorization,
  type LocalStanding,
  type OrphanEvidence,
  orphanRegularization,
} from "./orphan-authorization.js";
import type { TaxAuthorityVoucher } from "./unclear-outcome-decision.js";

const VOUCHER: TaxAuthorityVoucher = {
  issuedOn: "2026-10-01",
  total: 12_500,
  documentType: FACTURA_C_VOUCHER_TYPE,
  receiverDocumentType: 99,
  receiverDocumentNumber: 0,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-11",
};

const CONFIRMED: OrphanEvidence = {
  kind: "confirmed",
  pointOfSale: 12,
  number: 41,
  voucher: VOUCHER,
};

const OFFLINE_VOUCHER = { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 13, number: 7 };

describe("decideOrphanAuthorization", () => {
  it("corrects a confirmed authorization of a sale that has another authorized voucher with a credit note", () => {
    const local: LocalStanding = {
      kind: "local_sale",
      saleId: "sale-1",
      otherAuthorizedVoucher: OFFLINE_VOUCHER,
    };

    expect(decideOrphanAuthorization({ evidence: CONFIRMED, local })).toEqual({
      kind: "credit_note",
      saleId: "sale-1",
      pointOfSale: 12,
      associatedVoucher: { voucherType: 11, pointOfSale: 12, number: 41 },
      keptVoucher: OFFLINE_VOUCHER,
      total: 12_500,
      receiverTaxStatusCode: 5,
    });
  });

  it("leaves a confirmed authorization that is the only voucher of its sale alone", () => {
    expect(
      decideOrphanAuthorization({
        evidence: CONFIRMED,
        local: { kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: null },
      }),
    ).toEqual({ kind: "none" });
  });

  it("reports a confirmed authorization with no local sale behind it as invoicing outside the register", () => {
    expect(
      decideOrphanAuthorization({ evidence: CONFIRMED, local: { kind: "no_local_sale" } }),
    ).toEqual({
      kind: "external_invoicing",
      pointOfSale: 12,
      documentType: "factura_c",
      number: 41,
      voucher: { issuedOn: "2026-10-01", total: 12_500, authorizationCode: "75123456789012" },
    });
  });

  it("leaves an authorization that is already regularized alone", () => {
    expect(
      decideOrphanAuthorization({ evidence: CONFIRMED, local: { kind: "already_regularized" } }),
    ).toEqual({ kind: "none" });
  });

  it.each<[string, LocalStanding]>([
    ["no local sale", { kind: "no_local_sale" }],
    [
      "another authorized voucher",
      { kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: OFFLINE_VOUCHER },
    ],
  ])("does nothing with an authorization that is not confirmed, even with %s", (_case, local) => {
    expect(decideOrphanAuthorization({ evidence: { kind: "not_confirmed" }, local })).toEqual({
      kind: "none",
    });
  });
});

describe("orphanRegularization", () => {
  const NOW = new Date("2026-10-02T15:00:00.000Z");

  it("turns a credit note decision into a credit note request with the given id", () => {
    const decision = decideOrphanAuthorization({
      evidence: CONFIRMED,
      local: { kind: "local_sale", saleId: "sale-1", otherAuthorizedVoucher: OFFLINE_VOUCHER },
    });

    expect(orphanRegularization(decision, { creditNoteId: "credit-note-1", now: NOW })).toEqual({
      kind: "credit_note",
      creditNoteId: "credit-note-1",
      saleId: "sale-1",
      pointOfSale: 12,
      associatedVoucher: { voucherType: 11, pointOfSale: 12, number: 41 },
      keptVoucher: OFFLINE_VOUCHER,
      total: 12_500,
      receiverTaxStatusCode: 5,
    });
  });

  it("turns an external invoicing decision into the alert to open and an open task for a person", () => {
    const decision = decideOrphanAuthorization({
      evidence: CONFIRMED,
      local: { kind: "no_local_sale" },
    });

    expect(orphanRegularization(decision, { creditNoteId: "credit-note-1", now: NOW })).toEqual({
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
    });
  });

  it("regularizes nothing when the decision is none", () => {
    expect(
      orphanRegularization({ kind: "none" }, { creditNoteId: "credit-note-1", now: NOW }),
    ).toBeNull();
  });
});
