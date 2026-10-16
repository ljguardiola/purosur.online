import { describe, expect, it } from "vitest";
import { voidRefundPresentation, voidRefusalReason } from "./void-sale-text";

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

  it("says the register does not void a sale with an invoice yet", () => {
    expect(voidRefusalReason("carries_invoice")).toBe(
      "La caja todavía no anula una venta con factura. Se tramita como devolución.",
    );
  });

  it("has no reason for a sale that is already voided", () => {
    expect(voidRefusalReason("not_completed")).toBeUndefined();
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
  ] as const)("leaves a %s refund for a person to make outside the register", (method, name) => {
    expect(voidRefundPresentation({ method, amount: 250_000, state: "PENDING" })).toEqual({
      title: `${name} · $ 2.500,00`,
      description: "Queda un reembolso pendiente: una persona lo hace por fuera de la caja.",
      chip: { label: "Pendiente", tone: "info" },
      pending: true,
    });
  });

  it.each([
    ["QR", "QR de Mercado Pago"],
    ["POINT", "Point integrada"],
  ] as const)(
    "leaves a %s refund for the cloud to send to Mercado Pago once confirmed",
    (method, name) => {
      expect(voidRefundPresentation({ method, amount: 250_000, state: "PENDING" })).toEqual({
        title: `${name} · $ 2.500,00`,
        description:
          "Queda un reembolso pendiente que la nube envía a Mercado Pago al confirmarlo.",
        chip: { label: "Pendiente", tone: "info" },
        pending: true,
      });
    },
  );
});
