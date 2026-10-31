import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { completeSale } from "./complete-sale.js";
import {
  aRebuildablePaidOrder,
  FakeSaleLedger,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

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
          rules: FIXED_ARGENTINA_ZONE_RULES,
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

  describe("the sale_completed event", () => {
    function completedEventOf(ledger: FakeSaleLedger, total: number) {
      ledger.transaction((tx) =>
        completeSale(tx, new SequentialIds(), {
          rules: FIXED_ARGENTINA_ZONE_RULES,
          sale: SALE,
          total,
          payments: [],
          movements: [],
          actorId: "cashier",
          completedAt: COMPLETED_AT,
        }),
      );
      return ledger.state.outbox.find(({ event_type }) => event_type === "sale_completed");
    }

    it("is version 10 and names no paid order for a sale not rebuilt against one", () => {
      const ledger = new FakeSaleLedger({ sales: [SALE] });

      expect(completedEventOf(ledger, 5_900)).toMatchObject({
        schema_version: 10,
        payload: { rebuilt_paid_order: null },
      });
    });

    it("names the paid order a rebuilt sale was linked to, with the surplus that total leaves", () => {
      const ledger = new FakeSaleLedger({
        sales: [SALE],
        paidOrders: [aRebuildablePaidOrder({ paymentTransactionId: "order-7", amount: 9_000 })],
        rebuiltSales: [{ saleId: "sale-1", paymentTransactionId: "order-7" }],
      });

      expect(completedEventOf(ledger, 5_900)).toMatchObject({
        payload: { rebuilt_paid_order: { payment_transaction_id: "order-7", surplus: 3_100 } },
      });
    });

    it("carries a surplus of the paid amount over the total that is never negative, for every pair", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10_000_000 }),
          fc.integer({ min: 1, max: 10_000_000 }),
          (paid, total) => {
            const ledger = new FakeSaleLedger({
              sales: [SALE],
              paidOrders: [aRebuildablePaidOrder({ amount: paid })],
              rebuiltSales: [{ saleId: "sale-1", paymentTransactionId: "order-1" }],
            });

            expect(completedEventOf(ledger, total)?.payload).toMatchObject({
              rebuilt_paid_order: {
                payment_transaction_id: "order-1",
                surplus: Math.max(0, paid - total),
              },
            });
          },
        ),
      );
    });
  });
});
