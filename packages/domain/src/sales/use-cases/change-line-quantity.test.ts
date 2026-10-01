import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { changeLineQuantity } from "./change-line-quantity.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
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

const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01" };

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function storedLine(store: FakeSaleLedger, lineId: string) {
  return store.state.sales[0]?.lines.find((line) => line.id === lineId);
}

function change(
  store: FakeSaleLedger,
  lineId: string,
  quantity: number,
  actorId = "cashier",
  expectedQuantity = storedLine(store, lineId)?.quantity ?? 1,
) {
  return changeLineQuantity(
    { ledger: store, clock: new FixedClock(NOW) },
    { actorId, lineId, quantity, expectedQuantity },
  );
}

describe("changeLineQuantity", () => {
  it("raises a line's quantity and recomputes its total", () => {
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
    expect(store.state.outbox).toEqual([]);
  });

  it("lowers a line's quantity and leaves no trace of the units taken out", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    const outcome = change(store, "line-1", 1);

    expect(storedLine(store, "line-1")).toEqual({ ...YERBA_LINE, quantity: 1, lineTotal: 2500 });
    expect(outcome).toEqual({
      kind: "changed",
      sale: { ...OPEN_SALE, lines: [{ ...YERBA_LINE, quantity: 1, lineTotal: 2500 }, AZUCAR_LINE] },
    });
    expect(store.state).toEqual({
      ...before,
      sales: [
        { ...OPEN_SALE, lines: [{ ...YERBA_LINE, quantity: 1, lineTotal: 2500 }, AZUCAR_LINE] },
      ],
    });
    expect(store.transactions).toBe(1);
  });

  it("picks the promotion again when lowering", () => {
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
  });

  it("drops a promotion the lowered quantity no longer reaches", () => {
    const threeForOne = {
      id: "three-for-one",
      benefit: { kind: "BUY_N_PAY_M" as const, buyQty: 3, payQty: 1 },
    };
    const promoted = {
      ...YERBA_LINE,
      promotions: [threeForOne],
      promotionId: "three-for-one",
      discountAmount: 5000,
      lineTotal: 2500,
    };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [promoted] }] });

    change(store, "line-1", 2);

    expect(storedLine(store, "line-1")).toEqual({
      ...promoted,
      quantity: 2,
      promotionId: null,
      discountAmount: 0,
      lineTotal: 5000,
    });
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

  it("changes nothing when the quantity is the same", () => {
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

  it("applies the change when the line still has the quantity the screen showed", () => {
    const store = ledger();

    const outcome = change(store, "line-1", 1, "cashier", 3);

    expect(outcome).toEqual(expect.objectContaining({ kind: "changed" }));
    expect(storedLine(store, "line-1")).toEqual({ ...YERBA_LINE, quantity: 1, lineTotal: 2500 });
  });

  it("refuses a change computed from a quantity the line no longer has, writing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    const outcome = change(store, "line-1", 1, "cashier", 2);

    expect(outcome).toEqual({ kind: "stale_quantity" });
    expect(storedLine(store, "line-1")).toEqual(YERBA_LINE);
    expect(store.state).toEqual(before);
  });

  it("refuses a raise computed from a stale quantity too", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(change(store, "line-1", 4, "cashier", 2)).toEqual({ kind: "stale_quantity" });
    expect(store.state).toEqual(before);
  });

  it("checks the line exists before comparing the shown quantity", () => {
    expect(change(ledger(), "line-9", 2, "cashier", 7)).toEqual({ kind: "unknown_line" });
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

  it("leaves the quantity untouched when recording it fails", () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "recordLineQuantity";

    expect(() => change(store, "line-1", 1)).toThrow("recordLineQuantity failed");
    expect(store.state).toEqual(before);
  });
});

describe("change-line-quantity charge refusal", () => {
  it("tells that the sale reaches the threshold when changing a line quantity brings it to the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 13700 }] });

    expect(change(store, "line-1", 5)).toEqual(
      expect.objectContaining({
        chargeRefusal: { kind: "reaches_buyer_identification_threshold", threshold: 13700 },
      }),
    );
  });

  it("tells nothing is refused when changing a line quantity leaves the sale under the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 13701 }] });

    expect(change(store, "line-1", 5)).toHaveProperty("chargeRefusal", undefined);
  });

  it("tells that no threshold is in effect when there is none", () => {
    const store = ledger({ thresholds: [] });

    expect(change(store, "line-1", 5)).toEqual(
      expect.objectContaining({ chargeRefusal: { kind: "no_buyer_identification_threshold" } }),
    );
  });
});
