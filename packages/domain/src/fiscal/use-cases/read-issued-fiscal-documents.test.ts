import { describe, expect, it } from "vitest";
import { ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE } from "../model/issued-fiscal-document.js";
import type { IssuedFiscalDocument } from "./issued-fiscal-documents-reader.js";
import { readIssuedFiscalDocuments } from "./read-issued-fiscal-documents.js";
import { FakeIssuedFiscalDocumentsReader } from "./test-support/fake-issued-fiscal-documents-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };
const unfiltered = { registerId: undefined, kind: undefined, number: undefined, page: 1 };

function aReceipt(overrides: Partial<IssuedFiscalDocument> = {}): IssuedFiscalDocument {
  return {
    kind: "receipt",
    voucherType: 11,
    pointOfSale: 7,
    number: 12,
    issuedOn: "2026-10-04",
    issuedAt: new Date("2026-10-04T13:00:00.000Z"),
    register: { id: "register-1", name: "Caja 1" },
    authorization: { kind: "cae", code: "75123456789012", dueOn: "2026-10-14" },
    state: "authorized",
    contingency: false,
    total: 4_800,
    correctedVoucher: null,
    ...overrides,
  };
}

describe("readIssuedFiscalDocuments", () => {
  it("reads the documents of the asked range for the branch with the page size of the listing", async () => {
    const receipt = aReceipt();
    const reader = new FakeIssuedFiscalDocumentsReader([receipt]);

    const listing = await readIssuedFiscalDocuments(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        ...unfiltered,
        registerId: "register-1",
        kind: "receipt",
        number: 12,
        page: 1,
      },
    );

    expect(listing).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      documents: [receipt],
      total: 1,
      pageSize: ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE,
    });
    expect(reader.issuedInPeriodReads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: "register-1",
        kind: "receipt",
        number: 12,
        page: { number: 1, size: ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE },
      },
    ]);
  });

  it("asks for the current day of the clock when no range is asked", async () => {
    const reader = new FakeIssuedFiscalDocumentsReader();

    const listing = await readIssuedFiscalDocuments(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, ...unfiltered },
    );

    expect(listing.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.issuedInPeriodReads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("resolves the current day in Argentina, not in UTC", async () => {
    const reader = new FakeIssuedFiscalDocumentsReader();

    const listing = await readIssuedFiscalDocuments(
      { reader, clock: { now: () => new Date("2026-10-07T01:30:00.000Z") } },
      { locationId: "branch-1", asked: noRange, ...unfiltered },
    );

    expect(listing.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("asks for the requested page", async () => {
    const reader = new FakeIssuedFiscalDocumentsReader();

    await readIssuedFiscalDocuments(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, ...unfiltered, page: 3 },
    );

    expect(reader.issuedInPeriodReads[0]?.page).toEqual({
      number: 3,
      size: ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE,
    });
  });
});
