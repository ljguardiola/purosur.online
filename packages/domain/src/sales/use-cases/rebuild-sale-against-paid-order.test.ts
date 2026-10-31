import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { rebuildSaleAgainstPaidOrder } from "./rebuild-sale-against-paid-order.js";
import {
  aPointPaidOrder,
  aRebuildablePaidOrder,
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  RESTORATION_IN_PROGRESS,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const IDENTITY = { registerId: "register-1", deviceId: "device-1" };
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const OPEN_SALE: SaleWithLines = {
  id: "sale-0",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  saleDiscount: null,
  lines: [],
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: IDENTITY,
    session: SESSION,
    paidOrders: [aRebuildablePaidOrder()],
    ...state,
  });
}

function rebuild(store: FakeSaleLedger, paymentTransactionId = "order-1", actorId = "cashier") {
  return rebuildSaleAgainstPaidOrder(
    {
      ledger: store,
      restoration: store.restoration,
      clock: new FixedClock(NOW),
      ids: new SequentialIds(),
    },
    { actorId, paymentTransactionId },
  );
}

function refusedWith(store: FakeSaleLedger, paymentTransactionId = "order-1", actorId = "cashier") {
  const before = structuredClone(store.state);
  const outcome = rebuild(store, paymentTransactionId, actorId);
  expect(store.state).toEqual(before);
  return outcome;
}

describe("rebuildSaleAgainstPaidOrder", () => {
  it("opens an empty sale of the open session under a fresh id and links it to the paid order", () => {
    const store = ledger();

    const outcome = rebuild(store);

    expect(outcome).toEqual({ kind: "rebuilt", saleId: "id-1" });
    expect(store.state.sales).toEqual([
      {
        id: "id-1",
        registerId: "register-1",
        deviceId: "device-1",
        sessionId: "session-1",
        actorId: "cashier",
        state: "OPEN",
        saleDiscount: null,
        lines: [],
      },
    ]);
    expect(store.state.rebuiltSales).toEqual([
      { saleId: "id-1", paymentTransactionId: "order-1" },
    ]);
  });

  it("rebuilds against an integrated terminal paid order as well", () => {
    const store = ledger({ paidOrders: [aPointPaidOrder()] });

    expect(rebuild(store).kind).toBe("rebuilt");
  });

  it("lets the cashier rebuild while other paid orders still block selling and discovery is pending", () => {
    const store = ledger({
      paidOrdersWithoutSale: [{ resolved: false }],
      paidOrderDiscovery: "pending",
    });

    expect(rebuild(store).kind).toBe("rebuilt");
  });

  it("leaves the unresolved order untouched, since only completing the sale resolves it", () => {
    const store = ledger();

    rebuild(store);

    expect(store.state.paidOrders).toEqual([aRebuildablePaidOrder()]);
    expect(store.state.outbox).toEqual([]);
    expect(store.state.lastOperationNumber).toBe(0);
  });

  it("refuses a person who may not sell, before reading the order", () => {
    const store = ledger({ accesses: {}, paidOrders: [] });

    expect(refusedWith(store)).toEqual({ kind: "not_permitted" });
  });

  it("refuses while the register is being restored", () => {
    const store = ledger({ restoration: RESTORATION_IN_PROGRESS });

    expect(refusedWith(store)).toEqual({ kind: "restoration_in_progress" });
  });

  it("refuses without an open cash session", () => {
    const store = ledger({ session: undefined });

    expect(refusedWith(store)).toEqual({ kind: "no_open_session" });
  });

  it("refuses a paid order the register does not hold", () => {
    expect(refusedWith(ledger(), "unknown-order")).toEqual({ kind: "not_found" });
  });

  it("refuses a paid order that was already resolved", () => {
    const store = ledger({ paidOrders: [aRebuildablePaidOrder({ resolved: true })] });

    expect(refusedWith(store)).toEqual({ kind: "already_resolved" });
  });

  it("answers the open sale already rebuilt against the same paid order", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      rebuiltSales: [{ saleId: "sale-0", paymentTransactionId: "order-1" }],
    });

    expect(refusedWith(store)).toEqual({ kind: "already_open", saleId: "sale-0" });
  });

  it("refuses while another sale is open", () => {
    const store = ledger({ sales: [OPEN_SALE] });

    expect(refusedWith(store)).toEqual({ kind: "another_sale_open" });
  });

  it("refuses while a sale rebuilt against another paid order is open", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      paidOrders: [
        aRebuildablePaidOrder(),
        aRebuildablePaidOrder({ paymentTransactionId: "order-2" }),
      ],
      rebuiltSales: [{ saleId: "sale-0", paymentTransactionId: "order-2" }],
    });

    expect(refusedWith(store)).toEqual({ kind: "another_sale_open" });
  });

  it("names a resolved order before the sale that is open", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      paidOrders: [aRebuildablePaidOrder({ resolved: true })],
    });

    expect(refusedWith(store)).toEqual({ kind: "already_resolved" });
  });

  it.each([
    ["revoked", { revoked: true }, "installation_revoked"],
    ["localDatabaseDamaged", { localDatabaseDamaged: true }, "local_database_damaged"],
    ["newSalesStoppedByBattery", { newSalesStoppedByBattery: true }, "battery_critical"],
    ["newSalesStoppedByDisk", { newSalesStoppedByDisk: true }, "disk_space_short"],
    ["identity", { identity: undefined }, "unavailable"],
  ] as const)("refuses to start a sale when %s", (_name, state, kind) => {
    expect(refusedWith(ledger(state))).toEqual({ kind });
  });

  it.each([
    "recordOpenedSale",
    "recordSaleRebuiltAgainstPaidOrder",
  ] satisfies FakeSaleLedgerWrite[])("leaves nothing behind when %s fails", (write) => {
    const store = ledger();
    store.failOn = write;
    const before = structuredClone(store.state);

    expect(() => rebuild(store)).toThrow(`${write} failed`);

    expect(store.state).toEqual(before);
  });
});
