import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import type { ScaleReading } from "../../shared/index.js";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import type { SaleWithLines } from "../model/sale.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";
import { FakeScale } from "./test-support/fake-scale.js";
import { weighProductOnScale } from "./weigh-product-on-scale.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const };
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };
const STABLE_1250: ScaleReading = { kind: "stable", weightThousandths: 1250 };
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
const PAYMENT: SalePayment = {
  id: "payment-1",
  saleId: "sale-0",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 1000,
  tendered: 1000,
  state: "APPROVED",
  occurredAt: NOW,
};

function priceOf(productId: string, unitPrice: number) {
  return {
    id: `price-`,
    productId,
    priceListId: "list-1",
    unitPrice,
    validFrom: LONG_AGO,
  };
}

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    products: [YERBA, QUESO],
    prices: [priceOf("yerba", 2500), priceOf("queso", 9000)],
    ...state,
  });
}

function weigh(
  store: FakeSaleLedger,
  reading: ScaleReading = STABLE_1250,
  productId = "queso",
  actorId = "cashier",
) {
  return weighProductOnScale(
    {
      ledger: store,
      restoration: store.restoration,
      clock: new FixedClock(NOW),
      ids: new SequentialIds(),
      scale: new FakeScale(reading),
    },
    { actorId, productId },
  );
}

describe("weighProductOnScale", () => {
  it("adds a line holding the stable weight, priced per kilogram and recording the scale as its source", async () => {
    const store = ledger();

    const outcome = await weigh(store);

    const sale: SaleWithLines = {
      ...OPEN_SALE,
      id: "id-1",
      lines: [
        {
          id: "id-2",
          productId: "queso",
          productName: "Queso cremoso",
          saleUnit: "KG",
          weightSource: "SCALE",
          quantity: 1250,
          listUnitPrice: 9000,
          priceListId: "list-1",
          promotions: [],
          manualAdjustment: null,
          promotionId: null,
          discountAmount: 0,
          lineTotal: 11250,
        },
      ],
    };
    expect(outcome).toEqual({
      kind: "added",
      removedManualDiscount: false,
      removedSaleDiscount: false,
      sale,
      balance: { paid: 0, pending: 11250 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
      mercadoPagoChargeInProgress: null,
    });
    expect(store.state.sales).toEqual([sale]);
  });

  it("adds the line to the sale already open", async () => {
    const store = ledger({ sales: [OPEN_SALE] });

    const outcome = await weigh(store);

    expect(outcome.kind === "added" && outcome.sale.id).toBe("sale-0");
    expect(store.state.sales[0]?.lines).toHaveLength(1);
  });

  it("asks the scale once per call", async () => {
    const scale = new FakeScale(STABLE_1250);

    const store = ledger();
    await weighProductOnScale(
      {
        ledger: store,
        restoration: store.restoration,
        clock: new FixedClock(NOW),
        ids: new SequentialIds(),
        scale,
      },
      { actorId: "cashier", productId: "queso" },
    );

    expect(scale.reads).toBe(1);
  });

  it("answers weighing and records nothing while the scale is not stable", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, { kind: "not_stable" })).toEqual({ kind: "weighing" });
    expect(store.state).toEqual(before);
  });

  it.each([0, -1, 1.5, MAX_STOCK_QUANTITY + 1])(
    "answers weighing and records nothing for a stable weight of %s thousandths",
    async (weightThousandths) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(await weigh(store, { kind: "stable", weightThousandths })).toEqual({
        kind: "weighing",
      });
      expect(store.state).toEqual(before);
    },
  );

  it("answers that the scale is unavailable, recording nothing", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, { kind: "unavailable" })).toEqual({ kind: "scale_unavailable" });
    expect(store.state).toEqual(before);
  });

  it("refuses a product that is not sold any more, changing nothing", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, STABLE_1250, "discontinued")).toEqual({
      kind: "product_unavailable",
    });
    expect(store.state).toEqual(before);
  });

  it("refuses a product sold by the unit, changing nothing", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, STABLE_1250, "yerba")).toEqual({ kind: "not_sold_by_weight" });
    expect(store.state).toEqual(before);
  });

  it("refuses a product without a valid price, naming it and changing nothing", async () => {
    const store = ledger({ prices: [] });
    const before = structuredClone(store.state);

    expect(await weigh(store)).toEqual({ kind: "no_price", productName: "Queso cremoso" });
    expect(store.state).toEqual(before);
  });

  it("refuses before looking at the reading, whatever the scale says", async () => {
    const reading: ScaleReading = { kind: "unavailable" };

    expect(await weigh(ledger(), reading, "yerba")).toEqual({ kind: "not_sold_by_weight" });
    expect(await weigh(ledger({ prices: [] }), reading)).toEqual({
      kind: "no_price",
      productName: "Queso cremoso",
    });
    expect(await weigh(ledger({ session: undefined }), reading)).toEqual({
      kind: "no_open_session",
    });
    expect(await weigh(ledger(), reading, "queso", "stranger")).toEqual({ kind: "not_permitted" });
  });

  it("refuses to open a sale while a paid order without a sale is unresolved", async () => {
    expect(
      await weigh(ledger({ paidOrdersWithoutSale: [{ resolved: false }] }), STABLE_1250, "queso"),
    ).toEqual({ kind: "paid_order_without_sale" });
  });

  it("refuses to open a sale while this run's paid-order check waits for the cloud", async () => {
    expect(await weigh(ledger({ paidOrderDiscovery: "pending" }), STABLE_1250, "queso")).toEqual({
      kind: "paid_orders_not_checked",
    });
  });

  it("weighs onto the open sale while a paid order without a sale is unresolved", async () => {
    const outcome = await weigh(
      ledger({ sales: [OPEN_SALE], paidOrdersWithoutSale: [{ resolved: false }] }),
      STABLE_1250,
      "queso",
    );

    expect(outcome.kind).toBe("added");
  });

  it("checks the permission, the session, the payments, the revocation, the disk and the identity before the product", async () => {
    expect(await weigh(ledger({ session: undefined }), STABLE_1250, "unknown", "stranger")).toEqual(
      { kind: "not_permitted" },
    );
    expect(await weigh(ledger({ session: undefined }), STABLE_1250, "unknown")).toEqual({
      kind: "no_open_session",
    });
    expect(
      await weigh(ledger({ sales: [OPEN_SALE], payments: [PAYMENT] }), STABLE_1250, "unknown"),
    ).toEqual({ kind: "sale_has_payments" });
    expect(
      await weigh(ledger({ revoked: true, identity: undefined }), STABLE_1250, "unknown"),
    ).toEqual({ kind: "installation_revoked" });
    expect(
      await weigh(
        ledger({ newSalesStoppedByDisk: true, identity: undefined }),
        STABLE_1250,
        "unknown",
      ),
    ).toEqual({ kind: "disk_space_short" });
    expect(await weigh(ledger({ identity: undefined }), STABLE_1250, "unknown")).toEqual({
      kind: "unavailable",
    });
  });

  it("refuses to add a line to a sale with an approved payment, writing nothing", async () => {
    const store = ledger({ sales: [OPEN_SALE], payments: [PAYMENT] });
    const before = structuredClone(store.state);

    expect(await weigh(store)).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it.each<FakeSaleLedgerWrite>(["recordOpenedSale", "recordSaleLine"])(
    "leaves nothing behind when %s fails",
    async (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      await expect(weigh(store)).rejects.toThrow(` failed`);
      expect(store.state).toEqual(before);
    },
  );
});
