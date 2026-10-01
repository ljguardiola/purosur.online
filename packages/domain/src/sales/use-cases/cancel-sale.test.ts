import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import type { SaleLineRemoval } from "../model/sale-line-removal.js";
import { cancelSale } from "./cancel-sale.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA_LINE = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [{ id: "ten", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } }],
  promotionId: "ten",
  discountAmount: 750,
  lineTotal: 6750,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  occurredAt: new Date("2026-09-30T12:00:00.000Z"),
  lines: [YERBA_LINE],
};
const REMOVAL: SaleLineRemoval = {
  id: "removal-1",
  saleId: "sale-1",
  saleLineId: "line-9",
  productId: "azucar",
  qtyRemoved: 2,
  amountRemoved: 2400,
  actorId: "cashier",
  occurredAt: new Date("2026-09-30T12:10:00.000Z"),
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function cancel(store: FakeSaleLedger, actorId = "cashier") {
  return cancelSale(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { actorId },
  );
}

describe("cancelSale", () => {
  it("moves the open sale to cancelled and returns it", () => {
    const store = ledger();

    const outcome = cancel(store);

    expect(outcome).toEqual({ kind: "cancelled", sale: { ...OPEN_SALE, state: "CANCELLED" } });
    expect(store.state.sales[0]?.state).toBe("CANCELLED");
    expect(store.transactions).toBe(1);
  });

  it("announces the cancellation with the sale header, the lines it held and its removals", () => {
    const store = ledger({
      removals: [REMOVAL, { ...REMOVAL, id: "removal-x", saleId: "sale-0" }],
    });

    cancel(store);

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-1",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "sale_cancelled",
        schema_version: 1,
        occurred_at: "2026-09-30T12:34:56.789Z",
        actor_id: "cashier",
        payload: {
          id: "sale-1",
          register_id: "register-1",
          device_id: "device-1",
          session_id: "session-1",
          actor_id: "cashier",
          state: "CANCELLED",
          occurred_at: "2026-09-30T12:00:00.000Z",
          lines: [
            {
              id: "line-1",
              product_id: "yerba",
              product_name: "Yerba 1 kg",
              quantity: 3,
              list_unit_price: 2500,
              price_list_id: "list-1",
              promotion_id: "ten",
              discount_amount: 750,
              line_total: 6750,
            },
          ],
          removals: [
            {
              id: "removal-1",
              sale_line_id: "line-9",
              product_id: "azucar",
              qty_removed: 2,
              amount_removed: 2400,
              actor_id: "cashier",
              occurred_at: "2026-09-30T12:10:00.000Z",
            },
          ],
        },
      },
    ]);
  });

  it("announces a line without promotion with a null promotion", () => {
    const line = { ...YERBA_LINE, promotions: [], promotionId: null, discountAmount: 0 };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [line] }] });

    cancel(store);

    expect(store.state.outbox[0]?.payload).toEqual(
      expect.objectContaining({
        lines: [expect.objectContaining({ promotion_id: null, discount_amount: 0 })],
      }),
    );
  });

  it("cancels a sale that has no lines", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [] }] });

    expect(cancel(store)).toEqual({
      kind: "cancelled",
      sale: { ...OPEN_SALE, lines: [], state: "CANCELLED" },
    });
    expect(store.state.outbox[0]?.payload).toEqual(
      expect.objectContaining({ lines: [], removals: [] }),
    );
  });

  it("names the actor who cancelled, even when another actor opened the sale", () => {
    const store = ledger({
      accesses: { cashier: CASHIER },
      sales: [{ ...OPEN_SALE, actorId: "former" }],
    });

    cancel(store);

    expect(store.state.outbox[0]?.actor_id).toBe("cashier");
    expect(store.state.outbox[0]?.payload).toEqual(expect.objectContaining({ actor_id: "former" }));
  });

  it("refuses when there is no open sale, changing nothing", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, state: "COMPLETED" }] });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("does not cancel a sale of another session", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, sessionId: "session-0" }] });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses an actor without the permission", () => {
    const store = ledger({ accesses: { cashier: { isAdministrator: false, permissionKeys: [] } } });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("refuses without an open cash session", () => {
    expect(cancel(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({ accesses: { cashier: CASHIER, other: CASHIER } });
    const before = structuredClone(store.state);

    expect(cancel(store, "other")).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it.each<FakeSaleLedgerWrite>(["markSaleCancelled", "appendOutboxEvent"])(
    "leaves the sale open when %s fails",
    (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      expect(() => cancel(store)).toThrow(` failed`);
      expect(store.state).toEqual(before);
    },
  );
});
