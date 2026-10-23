import { canonicalOutboxEvent } from "@purosur/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { seedOfflinePointOfSale } from "../fiscal/test-support/offline-point-of-sale-fixtures.js";
import {
  alerts,
  creditNotes,
  inbox,
  offlineFiscalDocuments,
  offlineNumberBlocks,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { applySyncedEventsTask } from "./apply-synced-events-task.js";
import { hmacEventChain } from "./hmac-event-chain.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";

const CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");
const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const SALE_ID = "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d";
const DOCUMENT_ID = "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e";
const CREDIT_NOTE_ID = "8f3b9e5c-7d40-4bac-9e6f-3a4b5c6d7e8f";
const OFFLINE_POINT_OF_SALE = 8;

const route = eventsRouteUnderTest();

function pushOf(registerId: string, documentType: "factura_c" | "credit_note_c", number: number) {
  const creditNote =
    documentType === "credit_note_c"
      ? {
          credit_note_id: CREDIT_NOTE_ID,
          corrects: { voucher_type: 11, point_of_sale: 7, number: 12 },
          document: {
            id: CREDIT_NOTE_ID,
            total: 4800,
            receiver_tax_status_code: 5,
            corrects: { voucher_type: 11, point_of_sale: 7, number: 12 },
          },
        }
      : {};
  const unlinked = {
    event_id: crypto.randomUUID(),
    device_seq: 1,
    aggregate_type: "Sale",
    aggregate_id: SALE_ID,
    event_type: "offline_fiscal_document_issued",
    schema_version: documentType === "credit_note_c" ? 3 : 1,
    payload: {
      fiscal_document_id: DOCUMENT_ID,
      sale_id: SALE_ID,
      register_id: registerId,
      point_of_sale: OFFLINE_POINT_OF_SALE,
      document_type: documentType,
      number,
      issued_on: "2026-10-06",
      generated_at: "2026-10-06T11:20:00.000Z",
      generation_stamp: "20261006082000",
      offline_authorization_code: "21403471111111",
      fortnight_start: "2026-10-01",
      fortnight_end: "2026-10-15",
      buyer_document_type: 99,
      buyer_document_number: 0,
      buyer_tax_status_code: 5,
      total: 4800,
      net_amount: 4800,
      cause: "no_connectivity",
      ...creditNote,
    },
    occurred_at: "2026-10-06T11:20:00.000Z",
    actor_id: CASHIER,
  };
  const chain_hmac = hmacEventChain.link(CHAIN_KEY, null, canonicalOutboxEvent(unlinked));
  return {
    app_version: "1.4.0",
    telemetry: { wal_size_bytes: 4096, disk_free_bytes: 50_000_000, disk_free_ratio: 0.42 },
    events: [{ ...unlinked, chain_hmac }],
  };
}

async function enrolledWithSale() {
  const { deviceId, deviceToken, registerId } = await insertEnrolledInstallation(route.db, {
    now: NOW,
    outboxChainKey: CHAIN_KEY,
  });
  await applyCompletedSale(route.db, {
    deviceId,
    completedAt: new Date("2026-10-06T11:19:00.000Z"),
    total: 4800,
    overrides: { id: SALE_ID },
  });
  const push = (body: unknown) =>
    route.app.inject({
      method: "POST",
      url: "/events",
      payload: body as object,
      headers: { authorization: `Bearer ${deviceToken}` },
    });
  return { registerId, push };
}

describe("a credit note issued under a pre-obtained code pushed through POST /events", () => {
  it("is found with the voucher it corrects once applied, and a push sent again adds nothing", async () => {
    const { registerId, push } = await enrolledWithSale();
    const body = pushOf(registerId, "credit_note_c", 3);

    expect((await push(body)).json()).toMatchObject({ status: "ok", ack_seq: 1 });
    await applySyncedEventsTask(route.db, { now: () => NOW });
    expect((await push(body)).json()).toMatchObject({ status: "ok", ack_seq: 1 });
    await applySyncedEventsTask(route.db, { now: () => NOW });

    expect(await route.db.select().from(offlineFiscalDocuments)).toEqual([
      expect.objectContaining({
        id: DOCUMENT_ID,
        saleId: SALE_ID,
        registerId,
        documentType: "credit_note_c",
        number: 3,
        creditNoteId: CREDIT_NOTE_ID,
        correctedVoucherType: 11,
        correctedPointOfSale: 7,
        correctedNumber: 12,
      }),
    ]);
    expect(await route.db.select().from(inbox)).toEqual([
      expect.objectContaining({ appliedAt: NOW }),
    ]);
    expect(await route.db.select().from(alerts)).toEqual([]);
  });

  it("is applied all the same, with the alert that its invoice was already credited, when the cloud's own credit note corrects the voucher", async () => {
    const { registerId, push } = await enrolledWithSale();
    await route.db.insert(creditNotes).values({
      id: crypto.randomUUID(),
      registerId,
      saleId: crypto.randomUUID(),
      reason: "sale_void",
      pointOfSale: 7,
      associatedVoucherType: 11,
      associatedPointOfSale: 7,
      associatedNumber: 12,
      total: 4800,
      receiverTaxStatusCode: 5,
      createdAt: new Date("2026-10-06T11:00:00.000Z"),
    });

    await push(pushOf(registerId, "credit_note_c", 3));
    await applySyncedEventsTask(route.db, { now: () => NOW });

    expect(await route.db.select().from(offlineFiscalDocuments)).toHaveLength(1);
    expect(await route.db.select({ kind: alerts.kind }).from(alerts)).toEqual([
      { kind: "invoice_already_credited" },
    ]);
    expect(await route.db.select().from(inbox)).toEqual([
      expect.objectContaining({ appliedAt: NOW }),
    ]);
  });
});

describe("the offline number blocks advanced by the documents pushed", () => {
  async function inUseBlock(documentType: "factura_c" | "credit_note_c", registerId: string) {
    await route.db.insert(offlineNumberBlocks).values({
      pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
      documentType,
      registerId,
      firstNumber: 1,
      lastNumber: 12,
      status: "in_use",
      assignedAt: NOW,
      version: 1,
    });
  }

  async function blocksOf(documentType: "factura_c" | "credit_note_c") {
    return route.db
      .select({
        firstNumber: offlineNumberBlocks.firstNumber,
        status: offlineNumberBlocks.status,
      })
      .from(offlineNumberBlocks)
      .where(
        and(
          eq(offlineNumberBlocks.pointOfSaleNumber, OFFLINE_POINT_OF_SALE),
          eq(offlineNumberBlocks.documentType, documentType),
        ),
      )
      .orderBy(offlineNumberBlocks.firstNumber);
  }

  it("hands the credit note series its next block once a credit note uses up the block, and leaves the invoice series alone", async () => {
    const seeded = await seedOfflinePointOfSale(route.db);
    await inUseBlock("credit_note_c", seeded);
    await inUseBlock("factura_c", seeded);
    const { registerId, push } = await enrolledWithSale();

    await push(pushOf(registerId, "credit_note_c", 12));

    expect(await blocksOf("credit_note_c")).toEqual([
      { firstNumber: 1, status: "used_up" },
      { firstNumber: 13, status: "in_use" },
    ]);
    expect(await blocksOf("factura_c")).toEqual([{ firstNumber: 1, status: "in_use" }]);
  });

  it("hands the invoice series its next block once a factura uses up the block, and leaves the credit note series alone", async () => {
    const seeded = await seedOfflinePointOfSale(route.db);
    await inUseBlock("credit_note_c", seeded);
    await inUseBlock("factura_c", seeded);
    const { registerId, push } = await enrolledWithSale();

    await push(pushOf(registerId, "factura_c", 12));

    expect(await blocksOf("factura_c")).toEqual([
      { firstNumber: 1, status: "used_up" },
      { firstNumber: 13, status: "in_use" },
    ]);
    expect(await blocksOf("credit_note_c")).toEqual([{ firstNumber: 1, status: "in_use" }]);
  });
});
