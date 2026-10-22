import { describe, expect, it } from "vitest";
import { deferredSaleRecordedEvent } from "./deferred-sale-recorded-event.js";

describe("deferredSaleRecordedEvent", () => {
  it("drafts a Sale event carrying the record, its short code and the register it belongs to", () => {
    expect(
      deferredSaleRecordedEvent({
        eventId: "event-1",
        registerId: "register-1",
        actorId: "cashier",
        deferredSale: {
          id: "deferred-1",
          saleId: "sale-1",
          occurredAt: new Date("2026-10-02T02:30:00.000Z"),
          total: 12_500,
          reason: "fiscally_offline",
          shortCode: "7KQ4M2P9",
          routedAt: new Date("2026-10-02T02:30:01.000Z"),
        },
      }),
    ).toEqual({
      event_id: "event-1",
      aggregate_type: "Sale",
      aggregate_id: "sale-1",
      event_type: "deferred_sale_recorded",
      schema_version: 1,
      payload: {
        id: "deferred-1",
        sale_id: "sale-1",
        register_id: "register-1",
        occurred_at: "2026-10-02T02:30:00.000Z",
        total: 12_500,
        reason: "fiscally_offline",
        short_code: "7KQ4M2P9",
        routed_at: "2026-10-02T02:30:01.000Z",
      },
      occurred_at: "2026-10-02T02:30:01.000Z",
      actor_id: "cashier",
    });
  });
});
