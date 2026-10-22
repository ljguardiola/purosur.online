import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { completeSale } from "./complete-sale.js";
import { FakeSaleLedger, SequentialIds } from "./test-support/fake-sale-ledger.js";

const COMPLETED_AT = new Date("2026-10-02T02:30:00.000Z");
const SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  saleDiscount: null,
  lines: [],
};

describe("completeSale", () => {
  it("appends the gate failure after the events of the authorization decision it defers", () => {
    const ledger = new FakeSaleLedger({ sales: [SALE], issuerIdentifications: [] });

    ledger.transaction((tx) =>
      completeSale(
        {
          ...tx,
          decideSaleAuthorization: ({ saleId, decidedAt }) => {
            tx.appendOutboxEvent({
              event_id: "deferred-event",
              aggregate_type: "Sale",
              aggregate_id: saleId,
              event_type: "deferred_sale_recorded",
              schema_version: 1,
              payload: {},
              occurred_at: decidedAt.toISOString(),
              actor_id: SALE.actorId,
            });
          },
        },
        new SequentialIds(),
        {
          sale: SALE,
          total: 5_900,
          payments: [],
          movements: [],
          actorId: "cashier",
          completedAt: COMPLETED_AT,
        },
      ),
    );

    expect(ledger.state.outbox.map(({ event_type }) => event_type)).toEqual([
      "sale_completed",
      "deferred_sale_recorded",
      "fiscal_gate_failed",
    ]);
  });
});
