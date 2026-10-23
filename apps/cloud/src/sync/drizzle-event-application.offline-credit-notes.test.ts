import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { insertOfflineCreditNote } from "../fiscal/test-support/offline-fiscal-document-fixtures.js";
import { alerts, creditNotes, offlineFiscalDocuments } from "../platform/db/schema.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import {
  anOfflineCreditNoteFact,
  anOfflineFiscalDocumentFact,
} from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();
const CORRECTED = { voucherType: 11, pointOfSale: 7, number: 12 };
const FORTNIGHT = { start: "2026-10-01", end: "2026-10-15" };

async function record(
  fact: Extract<SyncedFact, { kind: "offline_fiscal_document_issued" }>,
  deviceId: string,
) {
  const event = unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 3,
      aggregate_type: "Sale",
      aggregate_id: fact.document.saleId,
      event_type: "offline_fiscal_document_issued",
      schema_version: 3,
      payload: {},
      occurred_at: "2026-10-06T11:20:00.000Z",
      actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      chain_hmac: "hmac",
    },
    { deviceId },
  );
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function enrolledWithSale() {
  const { deviceId, registerId } = await system.enrollInstallation();
  const saleId = await applyCompletedSale(system.db, {
    deviceId,
    completedAt: new Date("2026-10-06T11:20:00.000Z"),
    total: 4800,
  });
  return { deviceId, registerId, saleId };
}

describe("recording the credit note a register issued under a pre-obtained code", () => {
  it("keeps every field of the credit note with the voucher it corrects", async () => {
    const { deviceId, registerId, saleId } = await enrolledWithSale();
    const fact = anOfflineCreditNoteFact({ registerId, saleId });

    await record(fact, deviceId);

    expect(await system.db.select().from(offlineFiscalDocuments)).toEqual([
      {
        id: fact.document.fiscalDocumentId,
        saleId,
        registerId,
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
        recordedAt: new Date("2026-10-06T15:00:00.000Z"),
        creditNoteId: fact.document.creditNoteId,
        correctedVoucherType: 11,
        correctedPointOfSale: 7,
        correctedNumber: 12,
      },
    ]);
  });

  it("keeps it beside the factura of the same sale", async () => {
    const { deviceId, registerId, saleId } = await enrolledWithSale();
    await record(anOfflineFiscalDocumentFact({ registerId, saleId }), deviceId);

    await record(anOfflineCreditNoteFact({ registerId, saleId }), deviceId);

    expect(
      (await system.db.select().from(offlineFiscalDocuments)).map(
        ({ documentType }) => documentType,
      ),
    ).toEqual(expect.arrayContaining(["factura_c", "credit_note_c"]));
  });

  it("leaves the credit note as it is when the same one is recorded again", async () => {
    const { deviceId, registerId, saleId } = await enrolledWithSale();
    const fact = anOfflineCreditNoteFact({ registerId, saleId });

    await record(fact, deviceId);
    await record(fact, deviceId);

    expect(await system.db.select().from(offlineFiscalDocuments)).toHaveLength(1);
  });

  it("refuses a second credit note for the same sale", async () => {
    const { deviceId, registerId, saleId } = await enrolledWithSale();
    await record(anOfflineCreditNoteFact({ registerId, saleId }), deviceId);

    await expect(
      record(anOfflineCreditNoteFact({ registerId, saleId, number: 4 }), deviceId),
    ).rejects.toThrow();
  });

  it("refuses a credit note that names another register than the one that pushed it", async () => {
    const { deviceId, saleId } = await enrolledWithSale();
    const other = await system.enrollInstallation({ registerName: "Caja 2" });

    await expect(
      record(anOfflineCreditNoteFact({ registerId: other.registerId, saleId }), deviceId),
    ).rejects.toThrow(/register/);
  });
});

describe("the voucher a credit note corrects", () => {
  async function creditedOnline(registerId: string) {
    await system.db.insert(creditNotes).values({
      id: randomUUID(),
      registerId,
      saleId: randomUUID(),
      reason: "sale_void",
      pointOfSale: 8,
      associatedVoucherType: 11,
      associatedPointOfSale: 7,
      associatedNumber: 12,
      total: 4800,
      receiverTaxStatusCode: 5,
      createdAt: new Date("2026-10-06T11:00:00.000Z"),
    });
  }

  it("is credited when a credit note of the cloud corrects it", async () => {
    const { registerId } = await enrolledWithSale();
    await creditedOnline(registerId);

    expect(
      await system.application.transaction((tx) =>
        tx.voucherAlreadyCredited(CORRECTED, randomUUID()),
      ),
    ).toBe(true);
  });

  it("is credited when another offline credit note corrects it, and not by the one named", async () => {
    const { registerId } = await enrolledWithSale();
    const { id } = await insertOfflineCreditNote(system.db, {
      registerId,
      pointOfSale: 8,
      fortnight: FORTNIGHT,
      number: 1,
      corrects: CORRECTED,
    });

    expect(
      await system.application.transaction((tx) =>
        tx.voucherAlreadyCredited(CORRECTED, randomUUID()),
      ),
    ).toBe(true);
    expect(
      await system.application.transaction((tx) => tx.voucherAlreadyCredited(CORRECTED, id)),
    ).toBe(false);
  });

  it("is not credited by a credit note of another voucher", async () => {
    const { registerId } = await enrolledWithSale();
    await insertOfflineCreditNote(system.db, {
      registerId,
      pointOfSale: 8,
      fortnight: FORTNIGHT,
      number: 1,
      corrects: { ...CORRECTED, number: 13 },
    });

    expect(
      await system.application.transaction((tx) =>
        tx.voucherAlreadyCredited(CORRECTED, randomUUID()),
      ),
    ).toBe(false);
  });

  it("raises the alert that its invoice was already credited, once for the invoice", async () => {
    const saleId = randomUUID();
    const at = new Date("2026-10-06T15:00:00.000Z");

    await system.application.transaction(async (tx) => {
      await tx.raiseInvoiceAlreadyCredited({ voucher: CORRECTED, saleId }, at);
      await tx.raiseInvoiceAlreadyCredited({ voucher: CORRECTED, saleId }, at);
    });

    expect(await system.db.select({ kind: alerts.kind }).from(alerts)).toEqual([
      { kind: "invoice_already_credited" },
    ]);
  });
});
