import { randomUUID } from "node:crypto";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { offlineFiscalDocuments } from "../platform/db/schema.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { anOfflineFiscalDocumentFact } from "./test-support/synced-facts.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const system = eventApplicationUnderTest();

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
      schema_version: 1,
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
  return { deviceId, registerId, saleId: await appliedSaleOf(deviceId) };
}

function appliedSaleOf(deviceId: string) {
  return applyCompletedSale(system.db, {
    deviceId,
    completedAt: new Date("2026-10-06T11:20:00.000Z"),
    total: 4800,
  });
}

describe("recording the document a register issued under a pre-obtained code", () => {
  it("keeps every field of the document with the register it came from", async () => {
    const { deviceId, registerId, saleId } = await enrolledWithSale();
    const fact = anOfflineFiscalDocumentFact({ registerId, saleId, cause: "numbering_conflict" });

    await record(fact, deviceId);

    expect(await system.db.select().from(offlineFiscalDocuments)).toEqual([
      {
        id: fact.document.fiscalDocumentId,
        saleId,
        registerId,
        pointOfSale: 7,
        documentType: "factura_c",
        number: 12,
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
        cause: "numbering_conflict",
        recordedAt: new Date("2026-10-06T15:00:00.000Z"),
      },
    ]);
  });

  it("leaves the document as it is when the same document is recorded again", async () => {
    const { deviceId, registerId, saleId } = await enrolledWithSale();
    const fact = anOfflineFiscalDocumentFact({ registerId, saleId });

    await record(fact, deviceId);
    await record(fact, deviceId);

    expect(await system.db.select().from(offlineFiscalDocuments)).toHaveLength(1);
  });

  it("refuses a different document under a number already issued at the point of sale", async () => {
    const { deviceId, registerId, saleId } = await enrolledWithSale();
    await record(anOfflineFiscalDocumentFact({ registerId, saleId }), deviceId);
    const anotherSaleId = await appliedSaleOf(deviceId);

    await expect(
      record(
        anOfflineFiscalDocumentFact({ registerId, saleId: anotherSaleId, number: 12 }),
        deviceId,
      ),
    ).rejects.toThrow();

    expect(await system.db.select().from(offlineFiscalDocuments)).toHaveLength(1);
  });

  it("refuses a second document for the same sale", async () => {
    const { deviceId, registerId, saleId } = await enrolledWithSale();
    await record(anOfflineFiscalDocumentFact({ registerId, saleId }), deviceId);

    await expect(
      record(anOfflineFiscalDocumentFact({ registerId, saleId, number: 13 }), deviceId),
    ).rejects.toThrow();
  });

  it("refuses a document that names another register than the one that pushed it", async () => {
    const { deviceId, saleId } = await enrolledWithSale();
    const other = await system.enrollInstallation({ registerName: "Caja 2" });

    await expect(
      record(anOfflineFiscalDocumentFact({ registerId: other.registerId, saleId }), deviceId),
    ).rejects.toThrow(/register/);

    expect(await system.db.select().from(offlineFiscalDocuments)).toEqual([]);
  });

  it("refuses a document of a sale that was never applied", async () => {
    const { deviceId, registerId } = await system.enrollInstallation();

    await expect(
      record(anOfflineFiscalDocumentFact({ registerId, saleId: randomUUID() }), deviceId),
    ).rejects.toThrow(/sale .* is not applied/);

    expect(await system.db.select().from(offlineFiscalDocuments)).toEqual([]);
  });

  it("refuses a document of a sale applied for another register", async () => {
    const { deviceId, registerId } = await system.enrollInstallation();
    const other = await system.enrollInstallation({ registerName: "Caja 2" });
    const othersSaleId = await appliedSaleOf(other.deviceId);

    await expect(
      record(anOfflineFiscalDocumentFact({ registerId, saleId: othersSaleId }), deviceId),
    ).rejects.toThrow(/sale .* is not applied/);

    expect(await system.db.select().from(offlineFiscalDocuments)).toEqual([]);
  });
});
