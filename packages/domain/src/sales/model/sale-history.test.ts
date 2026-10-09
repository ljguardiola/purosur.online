import { describe, expect, it } from "vitest";
import type { FiscalDocumentState } from "../../fiscal/index.js";
import {
  SALES_HISTORY_PAGE_SIZE,
  type SaleFiscalDocument,
  type SaleFiscalFacts,
  saleComprobanteOf,
  saleStandingOf,
} from "./sale-history.js";

function document(state: FiscalDocumentState): SaleFiscalDocument {
  return { state, documentType: "FACTURA_C", pointOfSale: 3, number: 1204 };
}

const NO_DOCUMENT: SaleFiscalFacts = { deferred: false, fiscalDocument: null };

describe("saleStandingOf", () => {
  it("is completed when the sale has no fiscal document and was not deferred", () => {
    expect(saleStandingOf(NO_DOCUMENT)).toBe("completed");
  });

  it("is completed when its fiscal document is authorized", () => {
    expect(saleStandingOf({ deferred: false, fiscalDocument: document("AUTHORIZED") })).toBe(
      "completed",
    );
  });

  it("is in progress while its fiscal document is being requested", () => {
    expect(saleStandingOf({ deferred: false, fiscalDocument: document("REQUESTING") })).toBe(
      "in_progress",
    );
  });

  it("is deferred when it was routed to a deferred sale", () => {
    expect(saleStandingOf({ deferred: true, fiscalDocument: null })).toBe("deferred");
  });

  it.each<FiscalDocumentState>(["REJECTED", "UNKNOWN"])(
    "is deferred when its fiscal document ended %s and the sale was routed to deferred",
    (state) => {
      expect(saleStandingOf({ deferred: true, fiscalDocument: document(state) })).toBe("deferred");
    },
  );

  it("is deferred before it is in progress", () => {
    expect(saleStandingOf({ deferred: true, fiscalDocument: document("REQUESTING") })).toBe(
      "deferred",
    );
  });
});

describe("saleComprobanteOf", () => {
  it("is the authorized fiscal document with its point of sale and number", () => {
    expect(
      saleComprobanteOf({ deferred: false, fiscalDocument: document("AUTHORIZED") }),
    ).toEqual({ kind: "fiscal", documentType: "FACTURA_C", pointOfSale: 3, number: 1204 });
  });

  it("is a non-fiscal document when the sale is deferred", () => {
    expect(saleComprobanteOf({ deferred: true, fiscalDocument: null })).toEqual({
      kind: "deferred_non_fiscal",
    });
  });

  it.each<FiscalDocumentState>(["REJECTED", "UNKNOWN"])(
    "is a non-fiscal document when the deferred sale's fiscal document ended %s",
    (state) => {
      expect(saleComprobanteOf({ deferred: true, fiscalDocument: document(state) })).toEqual({
        kind: "deferred_non_fiscal",
      });
    },
  );

  it("is none while the fiscal document is still being requested", () => {
    expect(saleComprobanteOf({ deferred: false, fiscalDocument: document("REQUESTING") })).toEqual(
      { kind: "none" },
    );
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
