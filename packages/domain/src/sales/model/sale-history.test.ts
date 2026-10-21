import { describe, expect, it } from "vitest";
import type { FiscalDocumentState } from "../../fiscal/index.js";
import {
  isDeferralPending,
  SALE_STANDING_DEFINITIONS,
  SALE_STANDINGS,
  SALES_HISTORY_PAGE_SIZE,
  type SaleFiscalDocument,
  type SaleFiscalFacts,
  saleComprobanteOf,
  saleStandingOf,
} from "./sale-history.js";

function document(state: FiscalDocumentState): SaleFiscalDocument {
  return {
    state,
    documentType: "factura_c",
    authorization: "real_time",
    pointOfSale: 3,
    number: 1204,
  };
}

const NO_DOCUMENT: SaleFiscalFacts = { deferred: false, fiscalDocument: null };

describe("SALE_STANDINGS", () => {
  it("lists the standings a sale of the history can have, a voided one last", () => {
    expect(SALE_STANDINGS).toEqual(["completed", "in_progress", "deferred", "voided"]);
  });
});

describe("SALE_STANDING_DEFINITIONS", () => {
  it("defines each standing but completed by the facts that make a sale have it", () => {
    expect(SALE_STANDING_DEFINITIONS).toEqual({
      voided: { voided: true },
      deferred: { voided: false, deferred: true },
      in_progress: { voided: false, deferred: false, documentBeingRequested: true },
    });
  });
});

describe("saleStandingOf", () => {
  it("is voided when the sale was voided", () => {
    expect(saleStandingOf({ ...NO_DOCUMENT, voided: true })).toBe("voided");
  });

  it("is voided before it is deferred or in progress", () => {
    expect(saleStandingOf({ voided: true, deferred: true, fiscalDocument: null })).toBe("voided");
    expect(
      saleStandingOf({ voided: true, deferred: false, fiscalDocument: document("REQUESTING") }),
    ).toBe("voided");
  });

  it("is completed when the sale has no fiscal document and was not deferred", () => {
    expect(saleStandingOf({ ...NO_DOCUMENT, voided: false })).toBe("completed");
  });

  it("is completed when its fiscal document is authorized", () => {
    expect(
      saleStandingOf({ voided: false, deferred: false, fiscalDocument: document("AUTHORIZED") }),
    ).toBe("completed");
  });

  it("is in progress while its fiscal document is being requested", () => {
    expect(
      saleStandingOf({ voided: false, deferred: false, fiscalDocument: document("REQUESTING") }),
    ).toBe("in_progress");
  });

  it("is deferred when it was routed to a deferred sale", () => {
    expect(saleStandingOf({ voided: false, deferred: true, fiscalDocument: null })).toBe(
      "deferred",
    );
  });

  it.each<FiscalDocumentState>(["REJECTED", "UNKNOWN", "RELEASED", "CONFLICTING"])(
    "is deferred when its fiscal document ended %s and the sale was routed to deferred",
    (state) => {
      expect(
        saleStandingOf({ voided: false, deferred: true, fiscalDocument: document(state) }),
      ).toBe("deferred");
    },
  );

  it("is deferred before it is in progress", () => {
    expect(
      saleStandingOf({ voided: false, deferred: true, fiscalDocument: document("REQUESTING") }),
    ).toBe("deferred");
  });
});

describe("saleComprobanteOf", () => {
  it("is the authorized fiscal document with its point of sale and number", () => {
    expect(saleComprobanteOf({ deferred: false, fiscalDocument: document("AUTHORIZED") })).toEqual({
      kind: "fiscal",
      documentType: "factura_c",
      authorization: "real_time",
      pointOfSale: 3,
      number: 1204,
    });
  });

  it("carries how the document was authorized", () => {
    expect(
      saleComprobanteOf({
        deferred: false,
        fiscalDocument: { ...document("AUTHORIZED"), authorization: "offline_code" },
      }),
    ).toMatchObject({ kind: "fiscal", authorization: "offline_code" });
  });

  it("is a non-fiscal document when the sale is deferred", () => {
    expect(saleComprobanteOf({ deferred: true, fiscalDocument: null })).toEqual({
      kind: "deferred_non_fiscal",
    });
  });

  it.each<FiscalDocumentState>(["REJECTED", "UNKNOWN", "RELEASED", "CONFLICTING"])(
    "is a non-fiscal document when the deferred sale's fiscal document ended %s",
    (state) => {
      expect(saleComprobanteOf({ deferred: true, fiscalDocument: document(state) })).toEqual({
        kind: "deferred_non_fiscal",
      });
    },
  );

  it("is none while the fiscal document is still being requested", () => {
    expect(saleComprobanteOf({ deferred: false, fiscalDocument: document("REQUESTING") })).toEqual({
      kind: "none",
    });
  });

  it("is none when the sale has no fiscal document and was not deferred", () => {
    expect(saleComprobanteOf(NO_DOCUMENT)).toEqual({ kind: "none" });
  });
});

describe("SALES_HISTORY_PAGE_SIZE", () => {
  it("shows fifty sales per page", () => {
    expect(SALES_HISTORY_PAGE_SIZE).toBe(50);
  });
});

describe("isDeferralPending", () => {
  it("is pending for a deferred record no authorization satisfied", () => {
    expect(isDeferralPending({ satisfied: false })).toBe(true);
  });

  it("is not pending for a deferred record an authorization satisfied", () => {
    expect(isDeferralPending({ satisfied: true })).toBe(false);
  });

  it("is not pending for a sale that was never deferred", () => {
    expect(isDeferralPending(null)).toBe(false);
  });
});
