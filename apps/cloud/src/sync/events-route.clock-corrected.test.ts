import { canonicalOutboxEvent } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { alerts, clockCorrections, inbox, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applySyncedEventsTask } from "./apply-synced-events-task.js";
import { hmacEventChain } from "./hmac-event-chain.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";

const CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");
const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";

const route = eventsRouteUnderTest();

function pushOf(registerId: string) {
  const unlinked = {
    event_id: crypto.randomUUID(),
    device_seq: 1,
    aggregate_type: "CashRegister",
    aggregate_id: registerId,
    event_type: "clock_corrected",
    schema_version: 1,
    payload: {
      point_of_sale: 7,
      document_type: "factura_c",
      previous_reading: "2026-10-07T12:00:00.000Z",
      corrected_reading: "2026-10-05T12:00:00.000Z",
    },
    occurred_at: "2026-10-05T12:00:00.000Z",
    actor_id: CASHIER,
  };
  const chain_hmac = hmacEventChain.link(CHAIN_KEY, null, canonicalOutboxEvent(unlinked));
  return {
    app_version: "1.4.0",
    telemetry: { wal_size_bytes: 4096, disk_free_bytes: 50_000_000, disk_free_ratio: 0.42 },
    events: [{ ...unlinked, chain_hmac }],
  };
}

describe("a clock correction pushed through POST /events", () => {
  it("is kept with an open alert once applied, and a push sent again adds nothing", async () => {
    const { deviceToken, registerId, locationId } = await insertEnrolledInstallation(route.db, {
      now: NOW,
      outboxChainKey: CHAIN_KEY,
    });
    await route.db
      .insert(users)
      .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId });
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

    expect(await route.db.select().from(clockCorrections)).toEqual([
      expect.objectContaining({
        registerId,
        pointOfSale: 7,
        actorId: CASHIER,
        correctedAt: new Date("2026-10-05T12:00:00.000Z"),
      }),
    ]);
    expect(await route.db.select().from(alerts)).toEqual([
      expect.objectContaining({ kind: "clock_corrected", scope: registerId, resolvedAt: null }),
    ]);
    expect(await route.db.select().from(inbox)).toEqual([
      expect.objectContaining({ appliedAt: NOW }),
    ]);
  });
});
