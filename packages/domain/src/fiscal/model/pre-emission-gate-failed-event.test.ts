import { describe, expect, it } from "vitest";
import { preEmissionGateFailedEvent } from "./pre-emission-gate-failed-event.js";

describe("preEmissionGateFailedEvent", () => {
  it("drafts a Sale event naming the register, the reason and when the gate was evaluated", () => {
    const evaluatedAt = new Date("2026-10-01T12:00:00.000Z");

    expect(
      preEmissionGateFailedEvent({
        eventId: "event-1",
        saleId: "sale-1",
        registerId: "register-1",
        actorId: "cashier",
        reason: "legal_name_missing",
        evaluatedAt,
      }),
    ).toEqual({
      event_id: "event-1",
      aggregate_type: "Sale",
      aggregate_id: "sale-1",
      event_type: "fiscal_gate_failed",
      schema_version: 1,
      payload: {
        sale_id: "sale-1",
        register_id: "register-1",
        reason: "legal_name_missing",
        evaluated_at: "2026-10-01T12:00:00.000Z",
      },
      occurred_at: "2026-10-01T12:00:00.000Z",
      actor_id: "cashier",
    });
  });
});
