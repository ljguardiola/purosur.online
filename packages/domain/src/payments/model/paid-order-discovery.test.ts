import { describe, expect, expectTypeOf, it } from "vitest";
import {
  classifyPaidOrder,
  type LocalStateOfPaidOrder,
  PAID_ORDER_DISCOVERY_STATES,
  PAID_ORDER_DISCOVERY_WINDOW_HOURS,
  PAID_ORDER_PAYMENT_STATE,
  PAID_ORDER_REPLACED,
  type PaidOrderDiscoveryState,
  paidOrderDiscoveryStart,
  paidOrderDiscoveryWindowOpenFor,
  paidOrdersSellingRefusal,
  paidOrdersWithoutSaleLetSell,
  paidOrderWithoutSaleBlocksSelling,
  SALE_PAYMENT_STATE_HOLDING_PAID_ORDER,
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

describe("paid order discovery window of a payment transaction", () => {
  const createdAt = new Date("2026-10-10T12:00:00.000Z");
  const lastInstant = new Date("2026-10-13T12:00:00.000Z");

  it("is open the moment the payment was created", () => {
    expect(paidOrderDiscoveryWindowOpenFor({ createdAt }, createdAt)).toBe(true);
  });

  it("is still open exactly 72 hours after the payment was created", () => {
    expect(paidOrderDiscoveryWindowOpenFor({ createdAt }, lastInstant)).toBe(true);
  });

  it("is closed one millisecond after that", () => {
    expect(
      paidOrderDiscoveryWindowOpenFor({ createdAt }, new Date(lastInstant.getTime() + 1)),
    ).toBe(false);
  });
});

describe("paid order of a register", () => {
  it("is an approved order that no other order replaced", () => {
    expect(PAID_ORDER_PAYMENT_STATE).toBe("APPROVED");
    expect(PAID_ORDER_REPLACED).toBe(false);
  });

  it("is already held by a sale the register synced when that sale holds it approved", () => {
    expect(SALE_PAYMENT_STATE_HOLDING_PAID_ORDER).toBe("APPROVED");
  });
});

describe("the local state of a paid order", () => {
  it("tells only whether the order's sale is still open or already closed", () => {
    expectTypeOf<NonNullable<LocalStateOfPaidOrder["sale"]>>().toEqualTypeOf<"open" | "closed">();
    expectTypeOf<string>().not.toExtend<LocalStateOfPaidOrder["sale"]>();
  });
});

describe("classifying a paid order against the register's local state", () => {
  it("has nothing to do when the local payment is already approved", () => {
    expect(classifyPaidOrder({ payment: "APPROVED", sale: "closed" })).toBe("recorded");
    expect(classifyPaidOrder({ payment: "APPROVED", sale: "open" })).toBe("recorded");
    expect(classifyPaidOrder({ payment: "APPROVED", sale: undefined })).toBe("recorded");
  });

  it("leaves to the charge under way a payment the register still has pending", () => {
    expect(classifyPaidOrder({ payment: "PENDING", sale: "open" })).toBe("charge_under_way");
    expect(classifyPaidOrder({ payment: "PENDING", sale: undefined })).toBe("charge_under_way");
    expect(classifyPaidOrder({ payment: "PENDING", sale: "closed" })).toBe("charge_under_way");
  });

  it.each([
    ["no local payment", undefined],
    ["a declined local payment", "DECLINED"],
    ["a cancelled local payment", "CANCELLED"],
    ["an expired local payment", "EXPIRED"],
  ] as const)("applies it to the open sale when there is %s", (_name, payment) => {
    expect(classifyPaidOrder({ payment, sale: "open" })).toBe("apply_to_open_sale");
  });

  it("is a duplicate charge when the sale is closed and the local payment is not approved", () => {
    expect(classifyPaidOrder({ payment: undefined, sale: "closed" })).toBe("duplicate_charge");
    expect(classifyPaidOrder({ payment: "DECLINED", sale: "closed" })).toBe("duplicate_charge");
  });

  it("is a paid order without a sale when the register has no such sale", () => {
    expect(classifyPaidOrder({ payment: undefined, sale: undefined })).toBe("without_sale");
    expect(classifyPaidOrder({ payment: "EXPIRED", sale: undefined })).toBe("without_sale");
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

  it("lets the cashier sell when no paid order without a sale is unresolved", () => {
    expect(
      paidOrdersWithoutSaleLetSell([{ resolved: true }], { openSale: false, discovery: "checked" }),
    ).toBe(true);
    expect(paidOrdersWithoutSaleLetSell([], { openSale: true, discovery: "checked" })).toBe(true);
  });

  it("keeps the cashier from starting a sale while one is unresolved", () => {
    expect(
      paidOrdersWithoutSaleLetSell([{ resolved: false }], {
        openSale: false,
        discovery: "checked",
      }),
    ).toBe(false);
  });

  it("lets the cashier go on with the sale already open while one is unresolved", () => {
    expect(
      paidOrdersWithoutSaleLetSell([{ resolved: false }], { openSale: true, discovery: "pending" }),
    ).toBe(true);
  });

  it("keeps the cashier from starting a sale before the cloud answered this run's check", () => {
    expect(paidOrdersWithoutSaleLetSell([], { openSale: false, discovery: "pending" })).toBe(false);
  });

  it("lets the cashier start a sale once the check is deferred or done", () => {
    expect(paidOrdersWithoutSaleLetSell([], { openSale: false, discovery: "deferred" })).toBe(true);
    expect(paidOrdersWithoutSaleLetSell([], { openSale: false, discovery: "checked" })).toBe(true);
  });
});

describe("the paid-order check of a register's run", () => {
  it("is pending until the cloud answers, deferred without it, and checked once handled", () => {
    expect(PAID_ORDER_DISCOVERY_STATES).toEqual(["pending", "deferred", "checked"]);
    expectTypeOf<PaidOrderDiscoveryState>().toEqualTypeOf<"pending" | "deferred" | "checked">();
  });
});

describe("why starting a sale is refused", () => {
  it("names the paid order without a sale before a check still pending", () => {
    expect(
      paidOrdersSellingRefusal([{ resolved: false }], { openSale: false, discovery: "pending" }),
    ).toBe("paid_order_without_sale");
  });

  it("names the pending check when no paid order without a sale is unresolved", () => {
    expect(
      paidOrdersSellingRefusal([{ resolved: true }], { openSale: false, discovery: "pending" }),
    ).toBe("paid_orders_not_checked");
  });

  it("refuses nothing on the sale already open", () => {
    expect(
      paidOrdersSellingRefusal([{ resolved: false }], { openSale: true, discovery: "pending" }),
    ).toBeUndefined();
  });

  it("refuses nothing once the check is deferred and nothing is unresolved", () => {
    expect(
      paidOrdersSellingRefusal([{ resolved: true }], { openSale: false, discovery: "deferred" }),
    ).toBeUndefined();
  });
});
