import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { changeLineQuantity } from "./change-line-quantity.js";
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
  promotions: [],
  promotionId: null,
  discountAmount: 0,
  lineTotal: 7500,
};
const AZUCAR_LINE = {
  ...YERBA_LINE,
  id: "line-2",
  productId: "azucar",
  productName: "Azucar",
  quantity: 1,
  listUnitPrice: 1200,
  lineTotal: 1200,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  occurredAt: new Date("2026-09-30T12:00:00.000Z"),
  lines: [YERBA_LINE, AZUCAR_LINE],
};
const TEN_PERCENT = { id: "ten", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } };
const THREE_FOR_TWO = {
  id: "three-for-two",
  benefit: { kind: "BUY_N_PAY_M" as const, buyQty: 3, payQty: 2 },
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function change(store: FakeSaleLedger, lineId: string, quantity: number, actorId = "cashier") {
  return changeLineQuantity(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { actorId, lineId, quantity },
  );
}

function storedLine(store: FakeSaleLedger, lineId: string) {
  return store.state.sales[0]?.lines.find((line) => line.id === lineId);
}

describe("changeLineQuantity", () => {
  it("raises a line's quantity and recomputes its total, recording no removal", () => {
    const store = ledger();

    const outcome = change(store, "line-1", 5);

    expect(storedLine(store, "line-1")).toEqual({ ...YERBA_LINE, quantity: 5, lineTotal: 12500 });
    expect(outcome).toEqual({
      kind: "changed",
      sale: {
        ...OPEN_SALE,
        lines: [{ ...YERBA_LINE, quantity: 5, lineTotal: 12500 }, AZUCAR_LINE],
      },
    });
    expect(store.state.removals).toEqual([]);
    expect(store.state.outbox).toEqual([]);
  });

  it("lowers a line's quantity and records what left the sale in the same transaction", () => {
    const store = ledger();

    const outcome = change(store, "line-1", 1);

    expect(storedLine(store, "line-1")).toEqual({ ...YERBA_LINE, quantity: 1, lineTotal: 2500 });
    expect(outcome).toEqual({
      kind: "changed",
      sale: { ...OPEN_SALE, lines: [{ ...YERBA_LINE, quantity: 1, lineTotal: 2500 }, AZUCAR_LINE] },
    });
    expect(store.state.removals).toEqual([
      {
        id: "id-1",
        saleId: "sale-1",
        saleLineId: "line-1",
        productId: "yerba",
        qtyRemoved: 2,
        amountRemoved: 5000,
        actorId: "cashier",
        occurredAt: NOW,
      },
    ]);
    expect(store.transactions).toBe(1);
  });

  it("picks the promotion again when lowering, charging the removed amount against the promoted totals", () => {
    const promoted = {
      ...YERBA_LINE,
      promotions: [TEN_PERCENT, THREE_FOR_TWO],
      promotionId: "three-for-two",
      discountAmount: 2500,
      lineTotal: 5000,
    };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [promoted] }] });

    change(store, "line-1", 2);

    expect(storedLine(store, "line-1")).toEqual({
      ...promoted,
      quantity: 2,
      promotionId: "ten",
      discountAmount: 500,
      lineTotal: 4500,
    });
    expect(store.state.removals).toEqual([
      expect.objectContaining({ qtyRemoved: 1, amountRemoved: 500 }),
    ]);
  });

  it("picks the promotion again when raising, exactly as scanning another unit does", () => {
    const tenPercent = {
      ...YERBA_LINE,
      quantity: 2,
      promotions: [TEN_PERCENT, THREE_FOR_TWO],
      promotionId: "ten",
      discountAmount: 500,
      lineTotal: 4500,
    };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [tenPercent] }] });

    change(store, "line-1", 3);

    expect(storedLine(store, "line-1")).toEqual({
      ...tenPercent,
      quantity: 3,
      promotionId: "three-for-two",
      discountAmount: 2500,
      lineTotal: 5000,
    });
  });

  it("changes nothing and records no removal when the quantity is the same", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    const outcome = change(store, "line-1", 3);

    expect(outcome).toEqual({ kind: "changed", sale: OPEN_SALE });
    expect(store.state).toEqual(before);
  });

  it("writes nothing at all when the quantity is the same", () => {
    const store = ledger();
    store.failOn = "recordLineQuantity";

    expect(change(store, "line-1", 3)).toEqual(expect.objectContaining({ kind: "changed" }));
  });

  it("leaves the other lines as they were", () => {
    const store = ledger();

    change(store, "line-1", 1);

    expect(storedLine(store, "line-2")).toEqual(AZUCAR_LINE);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "refuses the quantity %s, changing nothing",
    (quantity) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(change(store, "line-1", quantity)).toEqual({ kind: "invalid_quantity" });
      expect(store.state).toEqual(before);
    },
  );

  it("refuses a line that is not in the open sale, changing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(change(store, "line-9", 2)).toEqual({ kind: "unknown_line" });
    expect(store.state).toEqual(before);
  });

  it("refuses when there is no open sale, changing nothing", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, state: "COMPLETED" }] });
    const before = structuredClone(store.state);

    expect(change(store, "line-1", 2)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("does not reach a line of a sale of another session", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, sessionId: "session-0" }] });
    const before = structuredClone(store.state);

    expect(change(store, "line-1", 2)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses an actor without the permission", () => {
    const store = ledger({ accesses: { cashier: { isAdministrator: false, permissionKeys: [] } } });
    const before = structuredClone(store.state);

    expect(change(store, "line-1", 2)).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("lets an Administrator who opened the session change a line", () => {
    const store = ledger({
      accesses: { cashier: { isAdministrator: true, permissionKeys: [] } },
    });

    expect(change(store, "line-1", 2)).toEqual(expect.objectContaining({ kind: "changed" }));
  });

  it("refuses without an open cash session", () => {
    const store = ledger({ session: undefined });

    expect(change(store, "line-1", 2)).toEqual({ kind: "no_open_session" });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({
      accesses: { cashier: CASHIER, other: CASHIER },
    });
    const before = structuredClone(store.state);

    expect(change(store, "line-1", 2, "other")).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("checks the actor's permission before whether a session is open", () => {
    const store = ledger({ accesses: {}, session: undefined });

    expect(change(store, "line-1", 2)).toEqual({ kind: "not_permitted" });
  });

  it("checks the session before the quantity and the quantity before the line", () => {
    expect(change(ledger({ session: undefined }), "line-9", 0)).toEqual({
      kind: "no_open_session",
    });
    expect(change(ledger({ sales: [] }), "line-9", 0)).toEqual({ kind: "no_open_sale" });
    expect(change(ledger(), "line-9", 0)).toEqual({ kind: "invalid_quantity" });
  });

  it.each<FakeSaleLedgerWrite>(["recordLineQuantity", "recordLineRemoval"])(
    "leaves the quantity and the removals untouched when %s fails",
    (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      expect(() => change(store, "line-1", 1)).toThrow(` failed`);
      expect(store.state).toEqual(before);
    },
  );
});
