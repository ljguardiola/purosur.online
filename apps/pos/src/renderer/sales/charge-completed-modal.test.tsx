import type { ReceiptPrintStatusOutcome } from "@purosur/contracts";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CompletedPayment } from "./charge-completed-modal";
import { ChargeCompletedModal } from "./charge-completed-modal";

const PRINTED: ReceiptPrintStatusOutcome = {
  kind: "found",
  next_copy: { kind: "original" },
  printed: true,
  standing: "printed",
  comprobante: { kind: "none" },
};
const SALE = { sale_id: "sale-1", total: 476_000 } as const;

async function renderModal(payment: CompletedPayment) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  return render(
    <ChargeCompletedModal
      saleId="sale-1"
      payment={payment}
      readReceiptStatus={vi.fn(async () => PRINTED)}
      mayChangePrinter={false}
      onNewSale={vi.fn()}
    />,
  );
}

describe("ChargeCompletedModal", () => {
  it("shows the cash handed over and the change of a cash charge", async () => {
    const screen = await renderModal({
      method: "CASH",
      charge: { kind: "completed", ...SALE, tendered: 500_000, change: 24_000 },
    });

    await expect.element(screen.getByRole("heading", { name: "Entregá el vuelto" })).toBeVisible();
    await expect.element(screen.getByText("Efectivo entregado")).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00")).toBeVisible();
  });

  it.each([
    ["TRANSFER", "Transferencia"],
    ["QR", "QR de Mercado Pago"],
    ["POINT", "Point integrada"],
    ["STANDALONE_TERMINAL", "Terminal independiente"],
  ] as const)(
    "shows what the last %s charge paid, beside the sale's total",
    async (method, label) => {
      const screen = await renderModal({
        method,
        charge: { kind: "completed", ...SALE, amount: 300_000 },
      });

      await expect
        .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
        .toBeVisible();
      await expect.element(screen.getByText(label, { exact: true })).toBeVisible();
      await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
      await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    },
  );
});
