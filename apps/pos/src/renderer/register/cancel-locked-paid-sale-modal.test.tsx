import type { CancelLockedSaleOutcome, OpenSale } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CancelLockedPaidSaleModal } from "./cancel-locked-paid-sale-modal";

type Refund = OpenSale["refunds_on_cancel"][number];

const CASH_REFUND: Refund = {
  payment_id: "p1",
  method: "CASH",
  amount: 100_000,
  state: "APPROVED",
  sent_by_cloud: false,
};
const TRANSFER_REFUND: Refund = {
  payment_id: "p2",
  method: "TRANSFER",
  amount: 250_000,
  state: "PENDING",
  sent_by_cloud: false,
};
const CASH_LINE = "Devolver $ 1.000,00 en efectivo";
const TRANSFER_LINE = "Reembolso pendiente de la transferencia por $ 2.500,00";
const PENDING_NOTE =
  "Un reembolso pendiente no se hace desde la caja: se atiende en el backoffice.";
const FAILED_NOTICE = "No se pudo cancelar la venta. Probá de nuevo.";

type CancelSale = () => Promise<CancelLockedSaleOutcome>;

async function renderModal(options: { refunds?: Refund[]; cancelSale?: CancelSale } = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const cancelSale = vi.fn<CancelSale>(
    options.cancelSale ?? (async () => ({ kind: "cancelled", refunds: [CASH_REFUND] })),
  );
  const handlers = {
    onCancelled: vi.fn(),
    onSaleGone: vi.fn(),
    onRefused: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <CancelLockedPaidSaleModal
      total={476_000}
      paid={350_000}
      refunds={options.refunds ?? [CASH_REFUND, TRANSFER_REFUND]}
      cancelSale={cancelSale}
      {...handlers}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "¿Cancelar la venta?" });
  return { screen, dialog, cancelSale, ...handlers };
}

describe("CancelLockedPaidSaleModal", () => {
  it("shows the total, what was paid and what would be refunded, with no PIN to type", async () => {
    const { screen, dialog } = await renderModal();

    await expect.element(dialog.getByText("Venta en curso · Con pagos")).toBeVisible();
    await expect.element(dialog.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(dialog.getByText("Pagado", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("$ 3.500,00")).toBeVisible();
    await expect.element(dialog.getByText(CASH_LINE)).toBeVisible();
    await expect.element(dialog.getByText(TRANSFER_LINE)).toBeVisible();
    await expect.element(dialog.getByText(PENDING_NOTE)).toBeVisible();
    await expect.element(dialog.getByLabelText("PIN")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("leaves out the pending refund note when every refund is given back on the spot", async () => {
    const { dialog } = await renderModal({ refunds: [CASH_REFUND] });

    await expect.element(dialog.getByText(CASH_LINE)).toBeVisible();
    await expect.element(dialog.getByText(PENDING_NOTE)).not.toBeInTheDocument();
  });

  it("adds no note of its own under a pending QR refund, whose line already says how it is handled", async () => {
    const { dialog } = await renderModal({
      refunds: [
        { payment_id: "p9", method: "QR", amount: 70_000, state: "PENDING", sent_by_cloud: true },
      ],
    });

    await expect
      .element(
        dialog.getByText("Reembolso pendiente del pago con QR por $ 700,00", { exact: true }),
      )
      .toBeVisible();
    await expect.element(dialog.getByText(/se atiende en el backoffice/)).not.toBeInTheDocument();
  });

  it("closes without cancelling when going back", async () => {
    const { dialog, cancelSale, onClose } = await renderModal();

    await dialog.getByRole("button", { name: "Volver" }).click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("hands the refunds the core answers to the screen once the sale is cancelled", async () => {
    const { dialog, cancelSale, onCancelled } = await renderModal({
      cancelSale: async () => ({ kind: "cancelled", refunds: [CASH_REFUND, TRANSFER_REFUND] }),
    });

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.poll(() => onCancelled).toHaveBeenCalledWith([CASH_REFUND, TRANSFER_REFUND]);
    expect(cancelSale).toHaveBeenCalledOnce();
  });

  it("disables its buttons while the sale is being cancelled", async () => {
    let settle!: (outcome: CancelLockedSaleOutcome) => void;
    const { dialog } = await renderModal({
      cancelSale: () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    });

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(dialog.getByRole("button", { name: "Volver" })).toBeDisabled();
    await expect.element(dialog.getByRole("button", { name: "Cancelar la venta" })).toBeDisabled();
    settle({ kind: "unavailable" });
    await expect.element(dialog.getByRole("button", { name: "Volver" })).toBeEnabled();
  });

  it("says the closer may not cancel sales with payments, keeping the sale", async () => {
    const { dialog, onCancelled, onClose } = await renderModal({
      cancelSale: async () => ({ kind: "not_permitted" }),
    });

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect
      .element(dialog.getByText("No tenés el permiso de anular ventas con pagos.").first())
      .toBeVisible();
    expect(onCancelled).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("tells the screen when the core finds no sale left to cancel", async () => {
    const { dialog, onSaleGone } = await renderModal({
      cancelSale: async () => ({ kind: "no_open_sale" }),
    });

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.poll(() => onSaleGone).toHaveBeenCalledOnce();
  });

  it("closes when the core finds no open session", async () => {
    const { dialog, onClose } = await renderModal({
      cancelSale: async () => ({ kind: "no_open_session" }),
    });

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.poll(() => onClose).toHaveBeenCalledOnce();
  });

  it.each<CancelLockedSaleOutcome>([
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "rate_limited", retry_after_seconds: 30, attempts_left: 1 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "lacks_permission" },
    { kind: "not_locked" },
  ])("hands the refusal $kind to the screen", async (refusal) => {
    const { dialog, onRefused, onCancelled } = await renderModal({
      cancelSale: async () => refusal,
    });

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.poll(() => onRefused).toHaveBeenCalledWith(refusal);
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it.each<[string, CancelLockedSaleOutcome, string]>([
    [
      "a QR charge is still waiting",
      { kind: "mercado_pago_charge_in_progress" },
      "Hay un cobro con Mercado Pago en curso. Esperá a que termine para cancelar la venta.",
    ],
  ])("keeps the modal open and says why when %s", async (_case, outcome, notice) => {
    const { dialog, onClose, onRefused, onCancelled } = await renderModal({
      cancelSale: async () => outcome,
    });

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(dialog.getByRole("alert")).toHaveTextContent(notice);
    await expect.element(dialog.getByRole("button", { name: "Volver" })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it.each<[string, CancelSale]>([
    ["the core is unavailable", async () => ({ kind: "unavailable" })],
    ["the request fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])("says the sale could not be cancelled when %s", async (_case, cancelSale) => {
    const { dialog, onClose } = await renderModal({ cancelSale });

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(dialog.getByText(FAILED_NOTICE).first()).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });
});
