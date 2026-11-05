import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import type { ScaleReading } from "../../shared/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
} from "./test-support/fake-sale-ledger.js";
import { FakeScale } from "./test-support/fake-scale.js";
import { weighLineOnScale } from "./weigh-line-on-scale.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const TEN_PERCENT = {
  id: "ten",
  name: "Diez por ciento",
  benefit: { kind: "PERCENT_OFF" as const, percent: 10 },
};
const QUESO_LINE: SaleLine = {
  id: "line-1",
  productId: "queso",
  productName: "Queso cremoso",
  saleUnit: "KG",
  weightSource: "MANUAL",
  quantity: 1000,
  listUnitPrice: 9000,
  priceListId: "list-1",
  promotions: [],
  manualAdjustment: null,
  promotionId: null,
  discountAmount: 0,
  lineTotal: 9000,
};
const YERBA_LINE: SaleLine = {
  ...QUESO_LINE,
  id: "line-2",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT",
  weightSource: null,
  quantity: 3,
  listUnitPrice: 2500,
  lineTotal: 7500,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  saleDiscount: null,
  cashRounding: 0,
  lines: [QUESO_LINE, YERBA_LINE],
};
const PAYMENT: SalePayment = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 1000,
  tendered: 1000,
  state: "APPROVED",
  occurredAt: NOW,
};
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };
const STABLE_2500: ScaleReading = { kind: "stable", weightThousandths: 2500 };

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

function weigh(
  store: FakeSaleLedger,
  reading: ScaleReading,
  confirmedWeightThousandths: number | null,
  lineId = "line-1",
  actorId = "cashier",
  expectedWeightThousandths = storedLine(store, lineId)?.quantity ?? 1,
) {
  return weighLineOnScale(
    {
      zoneRules: new FakeZoneRulesSource(),
      ledger: store,
      restoration: store.restoration,
      clock: new FixedClock(NOW),
      scale: new FakeScale(reading),
    },
    { actorId, lineId, expectedWeightThousandths, confirmedWeightThousandths },
  );
}

describe("weighLineOnScale confirming the weight", () => {
  it("sets the stable weight, recomputes the amount and records the scale as its source", async () => {
    const store = ledger();

    const outcome = await weigh(store, STABLE_2500, 2500);

    const changed = { ...QUESO_LINE, quantity: 2500, weightSource: "SCALE", lineTotal: 22500 };
    expect(storedLine(store, "line-1")).toEqual(changed);
    expect(outcome).toEqual({
      kind: "changed",
      removedManualDiscount: false,
      removedSaleDiscount: false,
      sale: { ...OPEN_SALE, lines: [changed, YERBA_LINE] },
      balance: { paid: 0, pending: 30000 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
      mercadoPagoChargeInProgress: null,
      rebuiltPaidOrder: null,
    });
  });

  it("records the scale as the source even when the weight is the same as the typed one", async () => {
    const store = ledger();

    await weigh(store, { kind: "stable", weightThousandths: 1000 }, 1000);

    expect(storedLine(store, "line-1")).toEqual({ ...QUESO_LINE, weightSource: "SCALE" });
  });

  it("writes nothing when a weight from the scale is taken again unchanged", async () => {
    const scaled = { ...QUESO_LINE, weightSource: "SCALE" as const };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [scaled] }] });
    const before = structuredClone(store.state);
    store.failOn = "recordChangedLine";

    const outcome = await weigh(store, { kind: "stable", weightThousandths: 1000 }, 1000);

    expect(outcome).toEqual(expect.objectContaining({ kind: "changed" }));
    expect(store.state).toEqual(before);
  });

  it("picks the promotion again on the new weight", async () => {
    const promoted = { ...QUESO_LINE, promotions: [TEN_PERCENT] };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [promoted] }] });

    await weigh(store, { kind: "stable", weightThousandths: 2000 }, 2000);

    expect(storedLine(store, "line-1")).toEqual({
      ...promoted,
      quantity: 2000,
      weightSource: "SCALE",
      promotionId: "ten",
      discountAmount: 1800,
      lineTotal: 16200,
    });
  });

  it("answers a stable weight other than the one confirmed with the line's amount at it, writing nothing", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, STABLE_2500, 1200)).toEqual({
      kind: "stable",
      weightThousandths: 2500,
      amount: 22500,
    });
    expect(store.state).toEqual(before);
  });

  it("answers weighing and writes nothing while the scale is not stable", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, { kind: "not_stable" }, 2500)).toEqual({ kind: "weighing" });
    expect(store.state).toEqual(before);
  });

  it("answers an unstable weight and its amount even when it is the confirmed one, recording nothing", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, { kind: "unstable", weightThousandths: 2500 }, 2500)).toEqual({
      kind: "unsteady",
      weightThousandths: 2500,
      amount: 22500,
    });
    expect(store.state).toEqual(before);
  });

  it("leaves the line untouched when recording it fails", async () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "recordChangedLine";

    await expect(weigh(store, STABLE_2500, 2500)).rejects.toThrow("recordChangedLine failed");
    expect(store.state).toEqual(before);
  });
});

describe("weighLineOnScale not confirming a weight", () => {
  it("answers the stable weight and the line's amount at it, writing nothing", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, STABLE_2500, null)).toEqual({
      kind: "stable",
      weightThousandths: 2500,
      amount: 22500,
    });
    expect(store.state).toEqual(before);
  });

  it("answers the amount the promotion gives at the weight read", async () => {
    const promoted = { ...QUESO_LINE, promotions: [TEN_PERCENT] };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [promoted] }] });

    expect(await weigh(store, { kind: "stable", weightThousandths: 2000 }, null)).toEqual({
      kind: "stable",
      weightThousandths: 2000,
      amount: 16200,
    });
  });
});

describe("weighLineOnScale refusals", () => {
  it.each([2500, null])("refuses a line sold by the unit confirming %s", async (confirmed) => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await weigh(store, STABLE_2500, confirmed, "line-2")).toEqual({
      kind: "not_sold_by_weight",
    });
    expect(store.state).toEqual(before);
  });

  it.each([2500, null])("refuses an unknown line confirming %s", async (confirmed) => {
    expect(await weigh(ledger(), STABLE_2500, confirmed, "line-9")).toEqual({
      kind: "unknown_line",
    });
  });

  it.each([2500, null])(
    "refuses a weight computed from a weight the line no longer has confirming %s",
    async (confirmed) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(await weigh(store, STABLE_2500, confirmed, "line-1", "cashier", 900)).toEqual({
        kind: "stale_weight",
      });
      expect(store.state).toEqual(before);
    },
  );

  it("refuses before looking at the reading, whatever the scale says", async () => {
    const reading: ScaleReading = { kind: "unavailable" };

    expect(await weigh(ledger({ session: undefined }), reading, null)).toEqual({
      kind: "no_open_session",
    });
    expect(await weigh(ledger({ sales: [] }), reading, null)).toEqual({ kind: "no_open_sale" });
    expect(await weigh(ledger({ payments: [PAYMENT] }), reading, null)).toEqual({
      kind: "sale_has_payments",
    });
    expect(await weigh(ledger(), reading, null, "line-9")).toEqual({ kind: "unknown_line" });
    expect(await weigh(ledger(), reading, null, "line-2")).toEqual({ kind: "not_sold_by_weight" });
    expect(await weigh(ledger(), reading, null, "line-1", "cashier", 99)).toEqual({
      kind: "stale_weight",
    });
    expect(await weigh(ledger(), reading, null, "line-1", "stranger")).toEqual({
      kind: "not_permitted",
    });
  });

  it("refuses an actor who did not open the current session", async () => {
    const store = ledger({ accesses: { cashier: CASHIER, other: CASHIER } });

    expect(await weigh(store, STABLE_2500, 2500, "line-1", "other")).toEqual({
      kind: "not_permitted",
    });
  });
});
