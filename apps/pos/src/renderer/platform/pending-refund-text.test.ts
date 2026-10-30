import { describe, expect, it } from "vitest";
import { pendingRefundPresentation } from "./pending-refund-text";

describe("pendingRefundPresentation", () => {
  it("says a refund the cloud sends is sent to Mercado Pago, as a pending one", () => {
    expect(pendingRefundPresentation(true)).toEqual({
      description: "Queda un reembolso pendiente que la nube envía a Mercado Pago al confirmarlo.",
      chip: { label: "Pendiente", tone: "info" },
    });
  });

  it("says another refund is made by a person outside the register, as a pending one", () => {
    expect(pendingRefundPresentation(false)).toEqual({
      description: "Queda un reembolso pendiente: una persona lo hace por fuera de la caja.",
      chip: { label: "Pendiente", tone: "info" },
    });
  });
});
