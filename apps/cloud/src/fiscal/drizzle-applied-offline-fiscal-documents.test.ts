import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";
import { recordAppliedOfflineFiscalDocument } from "./drizzle-applied-offline-fiscal-documents.js";

const ORIGIN: AppliedOrigin = {
  registerId: "register-1",
  deviceId: "device-1",
  locationId: "location-1",
};

const CREDIT_NOTE: Extract<SyncedFact, { kind: "offline_fiscal_document_issued" }> = {
  kind: "offline_fiscal_document_issued",
  document: {
    fiscalDocumentId: "document-1",
    saleId: "sale-1",
    registerId: "register-1",
    pointOfSale: 7,
    documentType: "credit_note_c",
    number: 3,
    issuedOn: "2026-10-06",
    generatedAt: new Date("2026-10-06T11:20:00.000Z"),
    generationStamp: "20261006082000",
    offlineAuthorizationCode: "21403471111111",
    fortnightStart: "2026-10-01",
    fortnightEnd: "2026-10-15",
    buyerDocumentType: 99,
    buyerDocumentNumber: 0,
    buyerTaxStatusCode: 5,
    total: 4800,
    netAmount: 4800,
    cause: "no_connectivity",
    creditNoteId: "credit-note-1",
    corrects: { voucherType: 11, pointOfSale: 7, number: 12 },
  },
};

describe("recordAppliedOfflineFiscalDocument", () => {
  it("refuses a credit note before touching the database, until the cloud applies them", async () => {
    const database = new Proxy(
      {},
      {
        get: () => {
          throw new Error("the database was touched");
        },
      },
    );

    await expect(
      recordAppliedOfflineFiscalDocument(database as never, ORIGIN, CREDIT_NOTE, new Date()),
    ).rejects.toThrow("document document-1 is a credit_note_c, which the cloud does not apply yet");
  });
});
