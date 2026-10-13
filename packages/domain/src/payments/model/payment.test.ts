import { describe, expect, expectTypeOf, it } from "vitest";
import {
  APPROVED_PAYMENT_STATE,
  cancellableWithoutAuthorization,
  hasApprovedPayment,
  holdsApprovedMercadoPagoPayment,
  isConfirmedByHand,
  MERCADO_PAGO_PAYMENT_METHODS,
  MERCADO_PAGO_PROVIDERS,
  PAYMENT_METHODS,
} from "./payment.js";
import type { SalePayment } from "./payment-transaction.js";

const APPROVED: SalePayment = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 2500,
  state: "APPROVED",
  occurredAt: new Date("2026-09-30T12:00:00.000Z"),
};

describe("cancellableWithoutAuthorization", () => {
  it("allows cancelling a sale that has no payment", () => {
    expect(cancellableWithoutAuthorization([])).toBe(true);
  });

  it("refuses cancelling a sale with an approved payment", () => {
    expect(cancellableWithoutAuthorization([APPROVED])).toBe(false);
  });

  it("allows cancelling a sale whose payments are not approved", () => {
    expect(cancellableWithoutAuthorization([{ state: "DECLINED" }])).toBe(true);
  });

  it("refuses when any of several payments is approved", () => {
    expect(cancellableWithoutAuthorization([APPROVED, { ...APPROVED, id: "payment-2" }])).toBe(
      false,
    );
  });
});

describe("hasApprovedPayment", () => {
  it("is false for a sale without payments", () => {
    expect(hasApprovedPayment([])).toBe(false);
  });

  it("is true when a payment is approved", () => {
    expect(hasApprovedPayment([APPROVED])).toBe(true);
  });

  it("is false when no payment is approved", () => {
    expect(hasApprovedPayment([{ state: "DECLINED" }])).toBe(false);
  });
});

describe("holdsApprovedMercadoPagoPayment", () => {
  const QR = { state: "APPROVED", method: "QR" } as const;
  const POINT = { state: "APPROVED", method: "POINT" } as const;

  it("is false for a sale without payments", () => {
    expect(holdsApprovedMercadoPagoPayment([])).toBe(false);
  });

  it("is true when an approved payment of several is by QR", () => {
    expect(holdsApprovedMercadoPagoPayment([APPROVED, QR])).toBe(true);
  });

  it("is false when only payments of other methods are approved", () => {
    expect(holdsApprovedMercadoPagoPayment([APPROVED, { ...APPROVED, method: "TRANSFER" }])).toBe(
      false,
    );
  });

  it("is true when an approved payment of several is by the integrated terminal", () => {
    expect(holdsApprovedMercadoPagoPayment([APPROVED, POINT])).toBe(true);
  });

  it("is false when the QR payment is not approved", () => {
    expect(holdsApprovedMercadoPagoPayment([{ ...QR, state: "PENDING" }])).toBe(false);
  });

  it("is false when the integrated terminal payment is not approved", () => {
    expect(holdsApprovedMercadoPagoPayment([{ ...POINT, state: "PENDING" }])).toBe(false);
  });
});

describe("SalePayment", () => {
  it("does not accept a transfer without who confirmed it and when", () => {
    type Transfer = Extract<SalePayment, { method: "TRANSFER" }>;

    expectTypeOf<Omit<Transfer, "authorizedBy">>().not.toExtend<SalePayment>();
    expectTypeOf<Omit<Transfer, "confirmedAt">>().not.toExtend<SalePayment>();
  });
});

describe("a Mercado Pago QR payment of a sale", () => {
  type QrPayment = Extract<SalePayment, { method: "QR" }>;

  it("is an approved payment processed by Mercado Pago QR", () => {
    expectTypeOf<QrPayment>().toExtend<{ provider: "MERCADOPAGO_QR"; state: "APPROVED" }>();
    expectTypeOf<Omit<QrPayment, "provider"> & { provider: "NONE" }>().not.toExtend<SalePayment>();
  });

  it("carries no tendered amount nor anyone who confirmed it", () => {
    expectTypeOf<QrPayment & { tendered: number }>().not.toExtend<SalePayment>();
    expectTypeOf<QrPayment & { authorizedBy: string }>().not.toExtend<SalePayment>();
  });
});

describe("PAYMENT_METHODS", () => {
  it("lists the standalone terminal beside cash, transfer, QR and the integrated terminal", () => {
    expect(PAYMENT_METHODS).toEqual(["CASH", "TRANSFER", "QR", "POINT", "STANDALONE_TERMINAL"]);
  });
});

describe("a Mercado Pago Point payment of a sale", () => {
  type PointPayment = Extract<SalePayment, { method: "POINT" }>;

  it("is an approved payment processed by Mercado Pago Point", () => {
    expectTypeOf<PointPayment>().toExtend<{ provider: "MERCADOPAGO_POINT"; state: "APPROVED" }>();
    expectTypeOf<
      Omit<PointPayment, "provider"> & { provider: "MERCADOPAGO_QR" }
    >().not.toExtend<SalePayment>();
  });

  it("carries no tendered amount nor anyone who confirmed it", () => {
    expectTypeOf<PointPayment & { tendered: number }>().not.toExtend<SalePayment>();
    expectTypeOf<PointPayment & { authorizedBy: string }>().not.toExtend<SalePayment>();
  });

  it("carries nothing about the card that paid", () => {
    for (const field of ["cardLastDigits", "cardType", "cardBrand", "cardholderName"] as const) {
      expectTypeOf<PointPayment>().not.toHaveProperty(field);
    }
  });
});

describe("the Mercado Pago methods and providers", () => {
  it("are the QR and the integrated terminal", () => {
    expect(MERCADO_PAGO_PAYMENT_METHODS).toEqual(["QR", "POINT"]);
    expect(MERCADO_PAGO_PROVIDERS).toEqual(["MERCADOPAGO_QR", "MERCADOPAGO_POINT"]);
  });

  it("are all methods of a payment", () => {
    for (const method of MERCADO_PAGO_PAYMENT_METHODS) {
      expect(PAYMENT_METHODS).toContain(method);
    }
  });
});

describe("APPROVED_PAYMENT_STATE", () => {
  it("is the state of a payment that was charged", () => {
    expect(APPROVED_PAYMENT_STATE).toBe("APPROVED");
  });
});

describe("a standalone terminal payment of a sale", () => {
  type StandalonePayment = Extract<SalePayment, { method: "STANDALONE_TERMINAL" }>;

  it("is an approved payment on the external terminal", () => {
    expectTypeOf<StandalonePayment>().toExtend<{
      provider: "EXTERNAL_TERMINAL";
      state: "APPROVED";
    }>();
    expectTypeOf<
      Omit<StandalonePayment, "provider"> & { provider: "NONE" }
    >().not.toExtend<SalePayment>();
  });

  it("does not accept one without who confirmed it and when", () => {
    expectTypeOf<Omit<StandalonePayment, "authorizedBy">>().not.toExtend<SalePayment>();
    expectTypeOf<Omit<StandalonePayment, "confirmedAt">>().not.toExtend<SalePayment>();
  });

  it("carries no tendered amount", () => {
    expectTypeOf<StandalonePayment & { tendered: number }>().not.toExtend<SalePayment>();
  });
});

describe("isConfirmedByHand", () => {
  it.each(["TRANSFER", "STANDALONE_TERMINAL"])("is true for %s", (method) => {
    expect(isConfirmedByHand({ method })).toBe(true);
  });

  it.each(["CASH", "QR", "POINT"])("is false for %s", (method) => {
    expect(isConfirmedByHand({ method })).toBe(false);
  });

  it("narrows a payment to the ones that carry who confirmed them and when", () => {
    const payment = APPROVED as SalePayment;

    if (isConfirmedByHand(payment)) {
      expectTypeOf(payment.authorizedBy).toEqualTypeOf<string>();
      expectTypeOf(payment.confirmedAt).toEqualTypeOf<Date>();
    }
  });
});
