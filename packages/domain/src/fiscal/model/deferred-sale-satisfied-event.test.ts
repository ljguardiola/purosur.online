import { describe, expect, it } from "vitest";
import { deferredSaleSatisfiedEvent } from "./deferred-sale-satisfied-event.js";

describe("deferredSaleSatisfiedEvent", () => {
  it("drafts a Sale event naming the record, the document that satisfied it and when", () => {
    expect(
      deferredSaleSatisfiedEvent({
        eventId: "event-1",
        registerId: "register-1",
        actorId: "cashier",
        deferredSaleId: "deferred-1",
        saleId: "sale-1",
        fiscalDocumentId: "document-1",
        pointOfSale: 7,
        number: 42,
        issuedOn: "2026-10-02",
        satisfiedAt: new Date("2026-10-04T15:00:00.000Z"),
      }),
    ).toEqual({
      event_id: "event-1",
      aggregate_type: "Sale",
      aggregate_id: "sale-1",
      event_type: "deferred_sale_satisfied",
      schema_version: 1,
      payload: {
        id: "deferred-1",
        sale_id: "sale-1",
        register_id: "register-1",
        fiscal_document_id: "document-1",
        point_of_sale: 7,
        number: 42,
        issued_on: "2026-10-02",
        satisfied_at: "2026-10-04T15:00:00.000Z",
      },
      occurred_at: "2026-10-04T15:00:00.000Z",
      actor_id: "cashier",
    });
  });
});
