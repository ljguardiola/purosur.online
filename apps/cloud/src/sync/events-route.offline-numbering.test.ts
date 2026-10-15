import { canonicalOutboxEvent } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { configureOfflinePointOfSale } from "../fiscal/test-support/offline-point-of-sale-fixtures.js";
import { inbox } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applySyncedEventsTask } from "./apply-synced-events-task.js";
import { hmacEventChain } from "./hmac-event-chain.js";
import { buildChangesRouteApp, pulledPage } from "./test-support/changes-route.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";

const CHAIN_KEY = Buffer.alloc(32, 5).toString("base64");
const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const OFFLINE_POINT_OF_SALE = 8;

const route = eventsRouteUnderTest();

const usedUpFirstBlock = {
  point_of_sale_number: OFFLINE_POINT_OF_SALE,
  document_type: "factura_c",
  first_number: 1,
  last_number: 1000,
  status: "used_up",
  version: 2,
};
const nextBlock = {
  point_of_sale_number: OFFLINE_POINT_OF_SALE,
  document_type: "factura_c",
  first_number: 1001,
  last_number: 2000,
  status: "in_use",
  version: 1,
};

function pushOfDocumentNumbered(registerId: string, number: number) {
  const saleId = crypto.randomUUID();
  const unlinked = {
    event_id: crypto.randomUUID(),
    device_seq: 1,
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "offline_fiscal_document_issued",
    schema_version: 1,
    payload: {
      fiscal_document_id: crypto.randomUUID(),
      sale_id: saleId,
      register_id: registerId,
      point_of_sale: OFFLINE_POINT_OF_SALE,
      document_type: "factura_c",
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

describe("an offline document pushed through POST /events that reaches the last number of its block", () => {
  it("brings the next contiguous block to the register's next pull, though the document cannot be applied", async () => {
    const registerId = await configureOfflinePointOfSale(route.db, {
      registerName: "Caja 1",
      realTimePointOfSale: 7,
      offlinePointOfSale: OFFLINE_POINT_OF_SALE,
      now: NOW,
    });
    const { deviceToken } = await insertEnrolledInstallation(route.db, {
      now: NOW,
      existingRegisterId: registerId,
      outboxChainKey: CHAIN_KEY,
    });

    const pushed = await route.app.inject({
      method: "POST",
      url: "/events",
      payload: pushOfDocumentNumbered(registerId, 1000),
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    await applySyncedEventsTask(route.db, { now: () => NOW });

    expect(pushed.json()).toMatchObject({ status: "ok", ack_seq: 1 });
    expect(await route.db.select({ appliedAt: inbox.appliedAt }).from(inbox)).toEqual([
      { appliedAt: null },
    ]);
    const pulls = buildChangesRouteApp(route.db, { now: () => NOW });
    const page = await pulledPage(pulls, 0, deviceToken);
    await pulls.close();
    expect(
      page.changes
        .filter((change) => change.entity === "offline_number_block")
        .map((change) => ("row" in change ? change.row : undefined)),
    ).toEqual([usedUpFirstBlock, usedUpFirstBlock, nextBlock]);
  });
});
