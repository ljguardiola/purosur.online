import { describe, expect, it } from "vitest";
import { voidRefundRow, voidRefusalReason } from "./void-sale-text";

describe("voidRefusalReason", () => {
  it("says a closed session can only be corrected as a return", () => {
    expect(voidRefusalReason("session_closed")).toBe(
      "La sesión de la venta ya cerró. Se tramita como devolución.",
    );
  });

  it("says to wait while the invoice is still being settled with the tax authority", () => {
    expect(voidRefusalReason("invoice_in_flight")).toBe(
      "La factura se está pidiendo a ARCA. Vas a poder anular cuando termine el trámite.",
    );
  });

  it("says a sale with a return is finished through another return", () => {
    expect(voidRefusalReason("has_return")).toBe(
      "Esta venta ya tiene una devolución: lo que queda se devuelve con otra devolución.",
    );
  });

  it("has no reason for a sale that is already voided", () => {
    expect(voidRefusalReason("not_completed")).toBeUndefined();
  });
});

describe("voidRefundRow", () => {
  it("gives cash back on the spot", () => {
    expect(
      voidRefundRow({
        method: "CASH",
        card_type: null,
        amount: 100_000,
        state: "APPROVED",
        sent_by_cloud: false,
      }),
    ).toEqual({
      name: "Efectivo",
      label: "Efectivo · en el acto",
      value: "$ 1.000,00",
      pending: false,
    });
  });

  it.each([
    ["TRANSFER", null, "Transferencia"],
    ["STANDALONE_TERMINAL", null, "Terminal independiente"],
    ["QR", null, "QR"],
    ["POINT", "DEBIT", "Point débito"],
  ] as const)("leaves a %s refund pending", (method, cardType, name) => {
    expect(
      voidRefundRow({
        method,
        card_type: cardType,
        amount: 250_000,
        state: "PENDING",
        sent_by_cloud: method === "QR",
      }),
    ).toEqual({
      name,
      label: `${name} · reembolso pendiente`,
      value: "$ 2.500,00",
      pending: true,
    });
  });
});
