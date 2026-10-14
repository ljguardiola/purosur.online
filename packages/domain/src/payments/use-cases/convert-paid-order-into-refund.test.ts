import { describe, expect, it } from "vitest";
import { convertPaidOrderIntoRefund } from "./convert-paid-order-into-refund.js";
import { anApprovedOrder, NOW, paidOrderWorld } from "./test-support/fake-paid-order-world.js";

const ORDER = anApprovedOrder();
const INPUT = { paymentTransactionId: ORDER.paymentTransactionId };

function worldWithAPaidOrderWithoutSale() {
  const world = paidOrderWorld();
  world.local.recordPaidOrderWithoutSale(ORDER, new Date("2026-10-13T11:30:00.000Z"));
  return world;
}

describe("convertPaidOrderIntoRefund", () => {
  it("asks the cloud to open the late payment refund and marks the order resolved", async () => {
    const { refunds, local, ports } = worldWithAPaidOrderWithoutSale();

    expect(await convertPaidOrderIntoRefund(ports, INPUT)).toEqual({ kind: "converted" });

    expect(refunds.pendingRefunds).toEqual([ORDER.paymentTransactionId]);
    expect(local.paidOrderWithoutSale(ORDER.paymentTransactionId)).toMatchObject({
      resolved: true,
      resolvedAt: NOW,
    });
  });

  it("resolves the order when the cloud already had the refund open", async () => {
    const { refunds, local, ports } = worldWithAPaidOrderWithoutSale();
    refunds.answers.set(ORDER.paymentTransactionId, { kind: "already_open" });

    expect(await convertPaidOrderIntoRefund(ports, INPUT)).toEqual({ kind: "converted" });

    expect(local.paidOrderWithoutSale(ORDER.paymentTransactionId)?.resolved).toBe(true);
  });

  it("leaves the order unresolved when the cloud cannot be reached", async () => {
    const { refunds, local, ports } = worldWithAPaidOrderWithoutSale();
    refunds.answers.set(ORDER.paymentTransactionId, { kind: "unreachable" });

    expect(await convertPaidOrderIntoRefund(ports, INPUT)).toEqual({ kind: "unreachable" });

    expect(local.paidOrderWithoutSale(ORDER.paymentTransactionId)?.resolved).toBe(false);
  });

  it("leaves the order unresolved when the cloud refuses the refund", async () => {
    const { refunds, local, ports } = worldWithAPaidOrderWithoutSale();
    refunds.answers.set(ORDER.paymentTransactionId, { kind: "refused" });

    expect(await convertPaidOrderIntoRefund(ports, INPUT)).toEqual({ kind: "refused" });

    expect(local.paidOrderWithoutSale(ORDER.paymentTransactionId)?.resolved).toBe(false);
  });

  it("answers not found, asking the cloud nothing, for an order the register never recorded", async () => {
    const { refunds, ports } = paidOrderWorld();

    expect(await convertPaidOrderIntoRefund(ports, INPUT)).toEqual({ kind: "not_found" });

    expect(refunds.asked).toEqual([]);
  });

  it("succeeds without asking the cloud again for an order already resolved", async () => {
    const { refunds, ports } = worldWithAPaidOrderWithoutSale();
    await convertPaidOrderIntoRefund(ports, INPUT);

    expect(await convertPaidOrderIntoRefund(ports, INPUT)).toEqual({ kind: "already_resolved" });

    expect(refunds.asked).toEqual([ORDER.paymentTransactionId]);
  });
});
