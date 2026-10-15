import { describe, expect, it } from "vitest";
import { voidRefundPresentation, voidRefusalNotice } from "./void-sale-text";

describe("voidRefusalNotice", () => {
  it("says a closed session can only be corrected as a return", () => {
    expect(voidRefusalNotice("session_closed")).toEqual({
      title: "No se puede anular: la sesión ya cerró",
      description: "Se tramita como devolución, escaneando el ticket del cliente en Devolver.",
    });
  });

  it("says to wait while the invoice is still being settled with the tax authority", () => {
    expect(voidRefusalNotice("invoice_in_flight")).toEqual({
      title: "Todavía no se puede anular",
      description:
        "La factura se está pidiendo a ARCA. Vas a poder anular cuando termine el trámite.",
    });
  });

  it("says the register does not void a sale with an invoice yet", () => {
    expect(voidRefusalNotice("carries_invoice")).toEqual({
      title: "Todavía no se puede anular",
      description: "La caja todavía no anula una venta con factura. Se tramita como devolución.",
    });
  });

  it("says the register does not void a sale paid through Mercado Pago yet", () => {
    expect(voidRefusalNotice("mercado_pago_payment")).toEqual({
      title: "Todavía no se puede anular",
      description:
        "La caja todavía no anula una venta con un pago de Mercado Pago. Se tramita como devolución.",
    });
  });

  it("has no notice for a sale that is already voided", () => {
    expect(voidRefusalNotice("not_completed")).toBeUndefined();
  });
});

describe("voidRefundPresentation", () => {
  it("gives cash back on the spot", () => {
    expect(voidRefundPresentation({ method: "CASH", amount: 100_000, state: "APPROVED" })).toEqual({
      title: "Efectivo · $ 1.000,00",
      description: "Lo devolvés en efectivo en el momento.",
      chip: { label: "En el acto", tone: "success" },
      pending: false,
    });
  });

  it.each([
    ["TRANSFER", "Transferencia"],
    ["STANDALONE_TERMINAL", "Terminal independiente"],
    ["POINT", "Point integrada"],
  ] as const)("leaves a %s refund for a person to make outside the register", (method, name) => {
    expect(voidRefundPresentation({ method, amount: 250_000, state: "PENDING" })).toEqual({
      title: `${name} · $ 2.500,00`,
      description: "Queda un reembolso pendiente: una persona lo hace por fuera de la caja.",
      chip: { label: "Pendiente", tone: "warning" },
      pending: true,
    });
  });

  it("leaves a QR refund for the cloud to send to Mercado Pago once it is confirmed", () => {
    expect(voidRefundPresentation({ method: "QR", amount: 90_000, state: "PENDING" })).toEqual({
      title: "QR de Mercado Pago · $ 900,00",
      description: "Queda un reembolso pendiente que la nube envía a Mercado Pago al confirmarlo.",
      chip: { label: "Pendiente", tone: "warning" },
      pending: true,
    });
  });
});
