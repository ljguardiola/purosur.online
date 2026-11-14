import type { CancelLockedSaleOutcome, OpenSale } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { CancelLockedPaidSalePanel } from "./cancel-locked-paid-sale-panel";

type Refund = OpenSale["refunds_on_cancel"][number];

const CASH_REFUND: Refund = {
  payment_id: "p1",
  method: "CASH",
  amount: 500_000,
  state: "APPROVED",
  sent_by_cloud: false,
};
const QR_REFUND: Refund = {
  payment_id: "p2",
  method: "QR",
  amount: 1_000_000,
  state: "PENDING",
  sent_by_cloud: true,
};
const FAILED_NOTICE = "No se pudo cancelar la venta. Probá de nuevo.";
const QR_WAIT =
  "Hay un cobro con Mercado Pago en curso. Esperá a que termine para cancelar la venta.";

type CancelSale = () => Promise<CancelLockedSaleOutcome>;

async function renderPanel(
  options: { refunds?: Refund[]; cancelSale?: CancelSale; chargeInProgress?: boolean } = {},
) {
  await page.viewport(1366, 768);
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
    <CancelLockedPaidSalePanel
      total={2_519_250}
      paid={1_500_000}
      refunds={options.refunds ?? [CASH_REFUND, QR_REFUND]}
      chargeInProgress={options.chargeInProgress ?? false}
      cancelSale={cancelSale}
      {...handlers}
    />,
  );
  return { screen, cancelSale, ...handlers };
}

describe("CancelLockedPaidSalePanel", () => {
  it("shows the total, what was paid and how each payment is refunded", async () => {
    const { screen } = await renderPanel();

    await expect
      .element(screen.getByRole("complementary", { name: "¿Cancelar la venta?" }))
      .toBeVisible();
    await expect.element(screen.getByText("VENTA EN CURSO · CON PAGOS")).toBeVisible();
    await expect.element(screen.getByText("$ 25.192,50", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Pagado", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 15.000,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Efectivo · en el acto")).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("QR · reembolso pendiente")).toBeVisible();
    await expect.element(screen.getByText("$ 10.000,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes back with Esc without cancelling", async () => {
    const { cancelSale, onClose } = await renderPanel();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("hands the refunds the core answers on once the sale is cancelled, with the button and with Enter", async () => {
    const { screen, cancelSale, onCancelled } = await renderPanel({
      cancelSale: async () => ({ kind: "cancelled", refunds: [CASH_REFUND, QR_REFUND] }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar la venta" }));
    await expect.poll(() => onCancelled).toHaveBeenCalledWith([CASH_REFUND, QR_REFUND]);
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => cancelSale.mock.calls.length).toBe(2);
  });

  it("disables its action and ignores Esc while the sale is being cancelled", async () => {
    let settle!: (outcome: CancelLockedSaleOutcome) => void;
    const { screen, onClose } = await renderPanel({
      cancelSale: () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar la venta" }));
    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("button", { name: "Cancelar la venta" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    settle({ kind: "unavailable" });
    await expect.element(screen.getByRole("button", { name: "Cancelar la venta" })).toBeEnabled();
  });

  it("says the closer may not cancel sales with payments, keeping the sale", async () => {
    const { screen, onCancelled, onClose } = await renderPanel({
      cancelSale: async () => ({ kind: "not_permitted" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar la venta" }));

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No tenés el permiso de anular ventas con pagos.");
    expect(onCancelled).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("tells the screen when the core finds no sale left to cancel", async () => {
    const { screen, onSaleGone } = await renderPanel({
      cancelSale: async () => ({ kind: "no_open_sale" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar la venta" }));

    await expect.poll(() => onSaleGone).toHaveBeenCalledOnce();
  });

  it("closes when the core finds no open session", async () => {
    const { screen, onClose } = await renderPanel({
      cancelSale: async () => ({ kind: "no_open_session" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar la venta" }));

    await expect.poll(() => onClose).toHaveBeenCalledOnce();
  });

  it.each<CancelLockedSaleOutcome>([
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "rate_limited", retry_after_seconds: 30, attempts_left: 1 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "lacks_permission" },
    { kind: "not_locked" },
  ])("hands the refusal $kind to the screen", async (refusal) => {
    const { screen, onRefused, onCancelled } = await renderPanel({
      cancelSale: async () => refusal,
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar la venta" }));

    await expect.poll(() => onRefused).toHaveBeenCalledWith(refusal);
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it("keeps the panel and says to wait when the core answers a charge is still in progress", async () => {
    const { screen, onClose, onRefused } = await renderPanel({
      cancelSale: async () => ({ kind: "mercado_pago_charge_in_progress" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar la venta" }));

    await expect.element(screen.getByRole("alert")).toHaveTextContent(QR_WAIT);
    expect(onClose).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
  });

  it.each<[string, CancelSale]>([
    ["the core is unavailable", async () => ({ kind: "unavailable" })],
    ["the restoration is in progress", async () => ({ kind: "restoration_in_progress" })],
    ["the request fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])("says the sale could not be cancelled when %s", async (_case, cancelSale) => {
    const { screen, onClose } = await renderPanel({ cancelSale });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar la venta" }));

    await expect.element(screen.getByRole("alert")).toHaveTextContent(FAILED_NOTICE);
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("while a Mercado Pago charge is in progress", () => {
    it("shows only what was paid, says to wait and keeps the action disabled", async () => {
      const { screen } = await renderPanel({ chargeInProgress: true });

      await expect.element(screen.getByText("Pagado", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Efectivo · en el acto")).not.toBeInTheDocument();
      await expect.element(screen.getByText("QR · reembolso pendiente")).not.toBeInTheDocument();
      await expect.element(screen.getByRole("alert")).toHaveTextContent(QR_WAIT);
      await expect
        .element(screen.getByRole("button", { name: "Cancelar la venta" }))
        .toBeDisabled();
    });

    it("does not cancel with Enter and goes back with Esc", async () => {
      const { cancelSale, onClose } = await renderPanel({ chargeInProgress: true });

      await userEvent.keyboard("{Enter}");
      expect(cancelSale).not.toHaveBeenCalled();
      await userEvent.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
