import { describe, expect, it } from "vitest";
import {
  classifyPaidOrder,
  PAID_ORDER_DISCOVERY_WINDOW_HOURS,
  PAID_ORDER_PAYMENT_STATE,
  PAID_ORDER_REPLACED,
  paidOrderDiscoveryStart,
  paidOrderWithoutSaleBlocksSelling,
} from "./paid-order-discovery.js";

describe("paid order discovery window", () => {
  it("looks back 72 hours", () => {
    expect(PAID_ORDER_DISCOVERY_WINDOW_HOURS).toBe(72);
  });

  it("starts from 72 hours before now", () => {
    expect(paidOrderDiscoveryStart(new Date("2026-10-13T12:00:00.000Z"))).toEqual(
      new Date("2026-10-10T12:00:00.000Z"),
    );
  });

  it("does not move the moment it was given", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    paidOrderDiscoveryStart(now);
    expect(now).toEqual(new Date("2026-10-13T12:00:00.000Z"));
  });
});

describe("paid order of a register", () => {
  it("is an approved order that no other order replaced", () => {
    expect(PAID_ORDER_PAYMENT_STATE).toBe("APPROVED");
    expect(PAID_ORDER_REPLACED).toBe(false);
  });
});

describe("classifying a paid order against the register's local state", () => {
  it("has nothing to do when the local payment is already approved", () => {
    expect(classifyPaidOrder({ payment: "APPROVED", sale: "COMPLETED" })).toBe("recorded");
    expect(classifyPaidOrder({ payment: "APPROVED", sale: "OPEN" })).toBe("recorded");
    expect(classifyPaidOrder({ payment: "APPROVED", sale: undefined })).toBe("recorded");
  });

  it.each([
    ["no local payment", undefined],
    ["a pending local payment", "PENDING"],
    ["a cancelled local payment", "CANCELLED"],
    ["an expired local payment", "EXPIRED"],
  ] as const)("applies it to the open sale when there is %s", (_name, payment) => {
    expect(classifyPaidOrder({ payment, sale: "OPEN" })).toBe("apply_to_open_sale");
  });

  it.each(["COMPLETED", "CANCELLED", "VOIDED"] as const)(
    "is a duplicate charge when the sale is %s and the local payment is not approved",
    (sale) => {
      expect(classifyPaidOrder({ payment: undefined, sale })).toBe("duplicate_charge");
      expect(classifyPaidOrder({ payment: "DECLINED", sale })).toBe("duplicate_charge");
    },
  );

  it("is a paid order without a sale when the register has no such sale", () => {
    expect(classifyPaidOrder({ payment: undefined, sale: undefined })).toBe("without_sale");
    expect(classifyPaidOrder({ payment: "PENDING", sale: undefined })).toBe("without_sale");
  });
});

describe("blocking sales", () => {
  it("blocks selling while any paid order without a sale is unresolved", () => {
    expect(paidOrderWithoutSaleBlocksSelling([{ resolved: true }, { resolved: false }])).toBe(true);
  });

  it("does not block selling when none is unresolved", () => {
    expect(paidOrderWithoutSaleBlocksSelling([])).toBe(false);
    expect(paidOrderWithoutSaleBlocksSelling([{ resolved: true }])).toBe(false);
  });
});
