import { describe, expect, it } from "vitest";
import { listPendingRefunds } from "./list-pending-refunds.js";
import {
  type FakePendingRefund,
  FakeRefundStore,
  FixedClock,
} from "./test-support/fake-refund-store.js";

const TRANSFER_REFUND: FakePendingRefund = {
  id: "refund-1",
  saleId: "sale-1",
  registerId: "register-1",
  registerName: "Caja 1",
  method: "TRANSFER",
  origin: "sale_cancelled",
  amount: 2000,
  occurredAt: new Date("2026-10-07T15:30:00.000Z"),
  saleOccurredAt: new Date("2026-10-07T15:30:00.000Z"),
  coveredBy: [],
  providerOrderId: null,
  cancelledBy: "cashier",
  cancelledByName: "Lucia",
  confirmedAt: null,
  sentAt: null,
  lastRefusalReason: null,
  locationId: "branch-1",
};

const NOW = new Date("2026-10-07T18:45:30.000Z");
const clock = new FixedClock(NOW);

describe("listPendingRefunds", () => {
  it("lists the pending refunds of the branch", async () => {
    const elsewhere = { ...TRANSFER_REFUND, id: "refund-2", locationId: "branch-2" };
    const store = new FakeRefundStore([], [TRANSFER_REFUND, elsewhere]);

    const refunds = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    const { locationId: _branch, ...listed } = TRANSFER_REFUND;
    expect(refunds).toEqual([
      {
        ...listed,
        discardable: false,
        sentByCloud: false,
        deliveryStage: null,
        secondsPending: 11_730,
      },
    ]);
    expect(store.pendingReads).toEqual(["branch-1"]);
  });

  it("lists a late-payment refund as discardable, with nobody who cancelled it", async () => {
    const late: FakePendingRefund = {
      ...TRANSFER_REFUND,
      id: "refund-3",
      method: "QR",
      origin: "late_payment",
      cancelledBy: null,
      cancelledByName: null,
    };
    const store = new FakeRefundStore([], [TRANSFER_REFUND, late]);

    const refunds = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refunds.map(({ id, origin, discardable }) => [id, origin, discardable])).toEqual([
      ["refund-1", "sale_cancelled", false],
      ["refund-3", "late_payment", true],
    ]);
    expect(refunds[1]).toMatchObject({ cancelledBy: null, cancelledByName: null });
  });

  it("lists an unconfirmed late QR payment refund as one the cloud sends, still discardable", async () => {
    const late: FakePendingRefund = { ...TRANSFER_REFUND, method: "QR", origin: "late_payment" };
    const store = new FakeRefundStore([], [late]);

    const [refund] = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refund).toMatchObject({
      discardable: true,
      sentByCloud: true,
      deliveryStage: "unconfirmed",
    });
  });

  it("lists a confirmed late QR payment refund as no longer discardable, with how far it got", async () => {
    const late: FakePendingRefund = {
      ...TRANSFER_REFUND,
      method: "QR",
      origin: "late_payment",
      confirmedAt: new Date("2026-10-07T16:00:00.000Z"),
      sentAt: new Date("2026-10-07T16:00:02.000Z"),
    };
    const store = new FakeRefundStore([], [late]);

    const [refund] = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refund).toMatchObject({ discardable: false, sentByCloud: true, deliveryStage: "sent" });
  });

  it("lists a late POINT payment refund as one carried out by hand, discardable", async () => {
    const late: FakePendingRefund = { ...TRANSFER_REFUND, method: "POINT", origin: "late_payment" };
    const store = new FakeRefundStore([], [late]);

    const [refund] = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refund).toMatchObject({ discardable: true, sentByCloud: false, deliveryStage: null });
  });

  it("lists the Mercado Pago order a late-payment refund names", async () => {
    const late: FakePendingRefund = {
      ...TRANSFER_REFUND,
      method: "QR",
      origin: "late_payment",
      providerOrderId: "order-2",
    };
    const store = new FakeRefundStore([], [late]);

    const [refund] = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refund?.providerOrderId).toBe("order-2");
  });

  it("lists nothing when the branch has no pending refund", async () => {
    const store = new FakeRefundStore();

    expect(await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" })).toEqual(
      [],
    );
  });

  it("counts the whole seconds a refund has been pending", async () => {
    const store = new FakeRefundStore(
      [],
      [{ ...TRANSFER_REFUND, occurredAt: new Date("2026-10-07T18:45:28.500Z") }],
    );

    const [refund] = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refund?.secondsPending).toBe(1);
  });

  it("never counts a negative time for a refund opened after the clock", async () => {
    const store = new FakeRefundStore(
      [],
      [{ ...TRANSFER_REFUND, occurredAt: new Date("2026-10-07T18:46:00.000Z") }],
    );

    const [refund] = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refund?.secondsPending).toBe(0);
  });

  it("hands on the sale's moment and the methods that covered it", async () => {
    const store = new FakeRefundStore(
      [],
      [
        {
          ...TRANSFER_REFUND,
          saleOccurredAt: new Date("2026-10-07T12:00:00.000Z"),
          coveredBy: ["CASH", "TRANSFER"],
        },
      ],
    );

    const [refund] = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refund).toMatchObject({
      saleOccurredAt: new Date("2026-10-07T12:00:00.000Z"),
      coveredBy: ["CASH", "TRANSFER"],
    });
  });

  it("lists a refund of a cancelled sale paid by QR as one the cloud sends, with how far it got", async () => {
    const confirmedAt = new Date("2026-10-07T16:00:00.000Z");
    const qr: FakePendingRefund = {
      ...TRANSFER_REFUND,
      method: "QR",
      confirmedAt,
      sentAt: new Date("2026-10-07T16:00:02.000Z"),
      lastRefusalReason: "insufficient_balance",
    };
    const store = new FakeRefundStore([], [TRANSFER_REFUND, qr]);

    const refunds = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refunds.map(({ sentByCloud }) => sentByCloud)).toEqual([false, true]);
    expect(refunds.map(({ deliveryStage }) => deliveryStage)).toEqual([
      null,
      "waiting_for_balance",
    ]);
    expect(refunds[1]).toMatchObject({
      confirmedAt,
      sentAt: new Date("2026-10-07T16:00:02.000Z"),
      lastRefusalReason: "insufficient_balance",
    });
  });

  it.each([["QR"], ["POINT"]])(
    "lists a refund of a voided sale paid by %s as one the cloud sends, already confirmed and on its way",
    async (method) => {
      const voided: FakePendingRefund = {
        ...TRANSFER_REFUND,
        method,
        origin: "sale_voided",
        confirmedAt: new Date("2026-10-07T15:30:00.000Z"),
      };
      const store = new FakeRefundStore([], [voided]);

      const [refund] = await listPendingRefunds(
        { reader: store, clock },
        { locationId: "branch-1" },
      );

      expect(refund).toMatchObject({
        origin: "sale_voided",
        discardable: false,
        sentByCloud: true,
        deliveryStage: "confirmed",
      });
    },
  );

  it("lists a refund of a voided sale paid by transfer as one carried out by hand", async () => {
    const store = new FakeRefundStore([], [{ ...TRANSFER_REFUND, origin: "sale_voided" }]);

    const [refund] = await listPendingRefunds({ reader: store, clock }, { locationId: "branch-1" });

    expect(refund).toMatchObject({ sentByCloud: false, deliveryStage: null });
  });
});
