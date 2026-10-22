import { describe, expect, it } from "vitest";
import type { SyncedFact } from "../model/synced-fact.js";
import { applyPendingEvents } from "./apply-pending-events.js";
import {
  aStoredEvent,
  FakeEventApplication,
  FakeEventUpcaster,
  FakeQuarantineNotices,
} from "./test-support/fake-event-application.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");
const CORRECTED = { voucherType: 11, pointOfSale: 7, number: 101 };

function creditNote(
  fiscalDocumentId: string,
  corrects = CORRECTED,
): Extract<SyncedFact, { kind: "offline_fiscal_document_issued" }> {
  return {
    kind: "offline_fiscal_document_issued",
    document: {
      fiscalDocumentId,
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
      corrects,
    },
  };
}

const factura: Extract<SyncedFact, { kind: "offline_fiscal_document_issued" }> = {
  kind: "offline_fiscal_document_issued",
  document: { ...creditNote("doc-factura").document, documentType: "factura_c", number: 101 },
};

const noteEvent = (eventId: string, deviceSeq = 1) =>
  aStoredEvent({
    eventId,
    deviceSeq,
    eventType: "offline_fiscal_document_issued",
    schemaVersion: 3,
  });

function apply(application: FakeEventApplication, facts: Record<string, SyncedFact>) {
  return applyPendingEvents(
    {
      eventApplication: application,
      upcaster: new FakeEventUpcaster(facts),
      clock: { now: () => NOW },
      quarantineNotices: new FakeQuarantineNotices(),
    },
    { limit: 100 },
  );
}

describe("applying a credit note issued under a pre-obtained code", () => {
  it("records it holding the lock of the voucher it corrects, and raises no alert while nothing else credits that voucher", async () => {
    const application = new FakeEventApplication([noteEvent("note-event")]);

    await apply(application, { "note-event": creditNote("doc-1") });

    expect(application.state.voucherLocks).toEqual([CORRECTED]);
    expect(application.state.writeOrder).toEqual(["lock voucher", "check voucher", "record"]);
    expect(application.state.alreadyCreditedAlerts).toEqual([]);
    expect(application.appliedEventIds).toEqual(["note-event"]);
  });

  it("records it all the same and raises the already credited alert when a credit note of the cloud already corrects the voucher", async () => {
    const application = new FakeEventApplication([noteEvent("note-event")]);
    application.state.creditedVouchers.push(CORRECTED);

    await apply(application, { "note-event": creditNote("doc-1") });

    expect(application.state.writeOrder).toEqual([
      "lock voucher",
      "check voucher",
      "record",
      "alert",
    ]);
    expect(application.state.recorded.map(({ eventId }) => eventId)).toEqual(["note-event"]);
    expect(application.state.alreadyCreditedAlerts).toEqual([
      { voucher: CORRECTED, saleId: "sale-1", at: NOW },
    ]);
    expect(application.appliedEventIds).toEqual(["note-event"]);
  });

  it("raises the alert for the second of two credit notes that correct the same voucher, and not for the first", async () => {
    const application = new FakeEventApplication([
      noteEvent("first-event", 1),
      aStoredEvent({
        eventId: "second-event",
        deviceSeq: 2,
        aggregateId: "sale-2",
        eventType: "offline_fiscal_document_issued",
        schemaVersion: 3,
      }),
    ]);

    await apply(application, {
      "first-event": creditNote("doc-1"),
      "second-event": creditNote("doc-2"),
    });

    expect(application.state.alreadyCreditedAlerts).toHaveLength(1);
    expect(application.state.recorded.map(({ eventId }) => eventId).sort()).toEqual([
      "first-event",
      "second-event",
    ]);
  });

  it("does not count a credit note as already credited by itself when it is applied again", async () => {
    const application = new FakeEventApplication([noteEvent("note-event")]);
    application.state.recorded.push({ fact: creditNote("doc-1"), eventId: "note-event" });

    await apply(application, { "note-event": creditNote("doc-1") });

    expect(application.state.alreadyCreditedAlerts).toEqual([]);
  });

  it("takes no lock and checks no voucher for the factura issued under a pre-obtained code", async () => {
    const application = new FakeEventApplication([noteEvent("factura-event")]);

    await apply(application, { "factura-event": factura });

    expect(application.state.writeOrder).toEqual(["record"]);
    expect(application.state.voucherLocks).toEqual([]);
  });
});
