import type { ConvertPaidOrderIntoRefundOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { deferred } from "../platform/test-support/deferred";
import { RefundPaidOrderModal } from "./refund-paid-order-modal";

const ORDER = {
  payment_transaction_id: "tx-1",
  method: "QR",
  amount: 80_000,
  created_at: "2026-09-30T15:30:00.000-03:00",
} as const;

type Convert = (paymentTransactionId: string) => Promise<ConvertPaidOrderIntoRefundOutcome>;

async function renderModal(options: { convert?: Convert } = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const convert = vi.fn<Convert>(options.convert ?? (async () => ({ kind: "converted" })));
  const handlers = {
    onConverted: vi.fn(),
    onGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <RefundPaidOrderModal order={ORDER} convertPaidOrderIntoRefund={convert} {...handlers} />,
  );
  const dialog = screen.getByRole("dialog", { name: "¿Pasar el cobro a reembolso?" });
  return { screen, dialog, convert, ...handlers };
}

function confirmButton(dialog: Awaited<ReturnType<typeof renderModal>>["dialog"]) {
  return dialog.getByRole("button", { name: "Pasar a reembolso" });
}

describe("RefundPaidOrderModal", () => {
  it("shows the amount and time of the payment and what passing it to refund means", async () => {
    const { screen, dialog } = await renderModal();

    await expect.element(dialog.getByText("Cobro con QR")).toBeVisible();
    await expect.element(dialog.getByText("$ 800,00")).toBeVisible();
    await expect.element(dialog.getByText("Cobrado a las")).toBeVisible();
    await expect.element(dialog.getByText("15:30")).toBeVisible();
    await expect.element(dialog.getByText(/se confirma después en el backoffice/)).toBeVisible();
    await expect.element(dialog.getByText(/no se le cobra de nuevo/)).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("sends one request when the confirmation is pressed twice before the modal shows it is sending", async () => {
    const answer = deferred<ConvertPaidOrderIntoRefundOutcome>();
    const { dialog, convert, onConverted } = await renderModal({ convert: () => answer.promise });
    const confirm = confirmButton(dialog).element() as HTMLElement;

    confirm.click();
    confirm.click();
    answer.resolve({ kind: "converted" });

    await vi.waitFor(() => expect(onConverted).toHaveBeenCalled());
    expect(convert).toHaveBeenCalledOnce();
  });

  it("closes without asking the core when going back", async () => {
    const { dialog, convert, onClose } = await renderModal();

    await userEvent.click(dialog.getByRole("button", { name: "Volver" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(convert).not.toHaveBeenCalled();
  });

  it.each<ConvertPaidOrderIntoRefundOutcome["kind"]>(["converted", "already_resolved"])(
    "tells the screen the order is resolved when the core answers %s",
    async (kind) => {
      const { dialog, convert, onConverted } = await renderModal({
        convert: async () => ({ kind }),
      });

      await userEvent.click(confirmButton(dialog));

      expect(convert).toHaveBeenCalledOnce();
      expect(convert).toHaveBeenCalledWith("tx-1");
      expect(onConverted).toHaveBeenCalledOnce();
    },
  );

  it("tells the screen when the core finds no such paid order", async () => {
    const { dialog, onGone } = await renderModal({ convert: async () => ({ kind: "not_found" }) });

    await userEvent.click(confirmButton(dialog));

    expect(onGone).toHaveBeenCalledOnce();
  });

  it("tells the route the session is no longer valid when the core finds nobody signed in", async () => {
    const { dialog, onSessionInvalid } = await renderModal({
      convert: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(confirmButton(dialog));

    expect(onSessionInvalid).toHaveBeenCalledOnce();
  });

  it.each<[ConvertPaidOrderIntoRefundOutcome["kind"], string]>([
    ["unreachable", "No hay conexión con la nube. Probá de nuevo cuando vuelva."],
    ["refused", "La nube no aceptó pasar el cobro a reembolso. Probá de nuevo más tarde."],
    ["not_permitted", "No tenés permiso para pasar un cobro a reembolso."],
    ["unavailable", "No se pudo pasar el cobro a reembolso. Probá de nuevo."],
  ])("keeps the dialog open and says why on %s", async (kind, message) => {
    const { screen, dialog, onConverted, onGone } = await renderModal({
      convert: async () => ({ kind }),
    });

    await userEvent.click(confirmButton(dialog));

    await expect.element(dialog.getByText(message).first()).toBeVisible();
    expect(onConverted).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says it could not pass the order when the request itself fails, and lets the person try again", async () => {
    const convert = vi
      .fn<Convert>()
      .mockRejectedValueOnce(new Error("the core could not answer"))
      .mockResolvedValue({ kind: "converted" });
    const { dialog, onConverted } = await renderModal({ convert });

    await userEvent.click(confirmButton(dialog));
    await expect
      .element(dialog.getByText("No se pudo pasar el cobro a reembolso. Probá de nuevo.").first())
      .toBeVisible();
    await userEvent.click(confirmButton(dialog));

    await expect.poll(() => onConverted.mock.calls.length).toBe(1);
  });

  it("sends one request and disables its buttons while the first is being answered", async () => {
    const answer = deferred<ConvertPaidOrderIntoRefundOutcome>();
    const { dialog, convert } = await renderModal({ convert: () => answer.promise });

    await userEvent.click(confirmButton(dialog));
    await expect.element(confirmButton(dialog)).toBeDisabled();
    await expect.element(dialog.getByRole("button", { name: "Volver" })).toBeDisabled();

    expect(convert).toHaveBeenCalledOnce();
  });
});
