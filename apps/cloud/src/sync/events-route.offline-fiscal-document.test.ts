import { canonicalOutboxEvent } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { inbox, offlineFiscalDocuments } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { applySyncedEventsTask } from "./apply-synced-events-task.js";
import { hmacEventChain } from "./hmac-event-chain.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";

const CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");
const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const SALE_ID = "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d";
const DOCUMENT_ID = "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e";

const route = eventsRouteUnderTest();

function pushOf(registerId: string) {
  const unlinked = {
    event_id: crypto.randomUUID(),
    device_seq: 1,
    aggregate_type: "Sale",
    aggregate_id: SALE_ID,
    event_type: "offline_fiscal_document_issued",
    schema_version: 1,
    payload: {
      fiscal_document_id: DOCUMENT_ID,
      sale_id: SALE_ID,
      register_id: registerId,
      point_of_sale: 7,
      document_type: "factura_c",
      number: 12,
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

describe("a document issued under a pre-obtained code pushed through POST /events", () => {
  it("is found with its cause and generation stamp once applied, and a push sent again adds nothing", async () => {
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
    const body = pushOf(registerId);
    const push = () =>
      route.app.inject({
        method: "POST",
        url: "/events",
        payload: body,
        headers: { authorization: `Bearer ${deviceToken}` },
      });

    expect((await push()).json()).toMatchObject({ status: "ok", ack_seq: 1 });
    await applySyncedEventsTask(route.db, { now: () => NOW });
    expect((await push()).json()).toMatchObject({ status: "ok", ack_seq: 1 });
    await applySyncedEventsTask(route.db, { now: () => NOW });

    expect(await route.db.select().from(offlineFiscalDocuments)).toEqual([
      expect.objectContaining({
        id: DOCUMENT_ID,
        saleId: SALE_ID,
        registerId,
        number: 12,
        cause: "no_connectivity",
        generationStamp: "20261006082000",
        offlineAuthorizationCode: "21403471111111",
      }),
    ]);
    expect(await route.db.select().from(inbox)).toEqual([
      expect.objectContaining({ appliedAt: NOW }),
    ]);
  });
});
