import { describe, expect, it } from "vitest";
import type { FiscalDocumentState } from "../model/real-time-authorization.js";
import { readUnknownFiscalDocuments } from "./read-unknown-fiscal-documents.js";
import { FakeCompletedSaleFiscalDocuments } from "./test-support/fake-completed-sale-fiscal-documents.js";

const COMPLETED_AT = new Date("2026-10-13T12:00:00.000Z");

function documentIn(id: string, state: FiscalDocumentState) {
  return { id, saleId: `sale-of-${id}`, completedAt: COMPLETED_AT, total: 4200, state };
}

describe("readUnknownFiscalDocuments", () => {
  it("answers the documents whose outcome is unknown, with their sale's time and total", () => {
    const documents = new FakeCompletedSaleFiscalDocuments([documentIn("doc-1", "UNKNOWN")]);

    expect(readUnknownFiscalDocuments({ documents })).toEqual([
      { id: "doc-1", saleId: "sale-of-doc-1", completedAt: COMPLETED_AT, total: 4200 },
    ]);
  });

  it("leaves out the documents being requested or already resolved", () => {
    const documents = new FakeCompletedSaleFiscalDocuments([
      documentIn("requesting", "REQUESTING"),
      documentIn("authorized", "AUTHORIZED"),
      documentIn("rejected", "REJECTED"),
      documentIn("released", "RELEASED"),
      documentIn("conflicting", "CONFLICTING"),
    ]);

    expect(readUnknownFiscalDocuments({ documents })).toEqual([]);
  });

  it("keeps the order the documents were answered in", () => {
    const documents = new FakeCompletedSaleFiscalDocuments([
      documentIn("doc-b", "UNKNOWN"),
      documentIn("authorized", "AUTHORIZED"),
      documentIn("doc-a", "UNKNOWN"),
    ]);

    expect(readUnknownFiscalDocuments({ documents }).map(({ id }) => id)).toEqual([
      "doc-b",
      "doc-a",
    ]);
  });
});
