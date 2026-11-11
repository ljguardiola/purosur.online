import type { ConvertPaidOrderIntoRefundOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { RegisterFrame } from "../shell/register-frame";
import { render } from "../shell/test-support/render-with-router";
import { RefundPaidOrderPanel } from "./refund-paid-order-panel";

const ORDER = {
  payment_transaction_id: "tx-1",
  method: "QR",
  amount: 80_000,
  created_at: "2026-09-30T15:30:00.000-03:00",
} as const;

type Convert = (paymentTransactionId: string) => Promise<ConvertPaidOrderIntoRefundOutcome>;

async function renderPanel(options: { convert?: Convert; method?: "QR" | "POINT" } = {}) {
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
    <RegisterFrame background="surface" rail={null}>
      <RefundPaidOrderPanel
        order={{ ...ORDER, method: options.method ?? ORDER.method }}
        convertPaidOrderIntoRefund={convert}
        {...handlers}
      />
    </RegisterFrame>,
  );
  const dialog = screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" });
  return { screen, dialog, convert, ...handlers };
}

function confirmButton(dialog: Awaited<ReturnType<typeof renderPanel>>["dialog"]) {
  return dialog.getByRole("button", { name: "Pasar a reembolso" });
}

describe("RefundPaidOrderPanel", () => {
  it("shows the amount and time of the payment and what it becomes", async () => {
    const { screen, dialog } = await renderPanel();

    await expect.element(dialog.getByText("Cobro con QR")).toBeVisible();
    await expect.element(dialog.getByText("$ 800,00")).toBeVisible();
    await expect.element(dialog.getByText("Cobrado a las")).toBeVisible();
    await expect.element(dialog.getByText("15:30")).toBeVisible();
    await expect.element(dialog.getByText("Pasa a ser")).toBeVisible();
    await expect.element(dialog.getByText("Reembolso pendiente")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the payment method of the Point terminal", async () => {
    const { dialog } = await renderPanel({ method: "POINT" });

    await expect.element(dialog.getByText("Cobro con Point")).toBeVisible();
  });

  it("has an Esc close and no Volver button nor explanation", async () => {
    const { dialog } = await renderPanel();

    await expect.element(dialog.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await expect.element(dialog.getByRole("button", { name: "Volver" })).not.toBeInTheDocument();
    await expect.element(dialog.getByText(/no se le cobra de nuevo/)).not.toBeInTheDocument();
  });

  it("sends one request when the confirmation is pressed twice before the modal shows it is sending", async () => {
    const answer = deferred<ConvertPaidOrderIntoRefundOutcome>();
    const { dialog, convert, onConverted } = await renderPanel({ convert: () => answer.promise });
    const confirm = confirmButton(dialog).element() as HTMLElement;

    confirm.click();
    confirm.click();
    answer.resolve({ kind: "converted" });

    await vi.waitFor(() => expect(onConverted).toHaveBeenCalled());
    expect(convert).toHaveBeenCalledOnce();
  });

  it("closes without asking the core when Esc is pressed", async () => {
    const { convert, onClose } = await renderPanel();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(convert).not.toHaveBeenCalled();
  });

  it("closes without asking the core when the Esc button is pressed", async () => {
    const { dialog, convert, onClose } = await renderPanel();

    await userEvent.click(dialog.getByRole("button", { name: "Cerrar con Esc" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(convert).not.toHaveBeenCalled();
  });

  it("passes the order to refund when Enter is pressed as soon as the panel opens", async () => {
    const { dialog, convert, onConverted } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(onConverted).toHaveBeenCalledOnce());
    expect(convert).toHaveBeenCalledExactlyOnceWith("tx-1");
  });

  it.each<ConvertPaidOrderIntoRefundOutcome["kind"]>(["converted", "already_resolved"])(
    "tells the screen the order is resolved when the core answers %s",
    async (kind) => {
      const { dialog, convert, onConverted } = await renderPanel({
        convert: async () => ({ kind }),
      });

      await userEvent.click(confirmButton(dialog));

      expect(convert).toHaveBeenCalledOnce();
      expect(convert).toHaveBeenCalledWith("tx-1");
      expect(onConverted).toHaveBeenCalledOnce();
    },
  );

  it("tells the screen when the core finds no such paid order", async () => {
    const { dialog, onGone } = await renderPanel({ convert: async () => ({ kind: "not_found" }) });

    await userEvent.click(confirmButton(dialog));

    expect(onGone).toHaveBeenCalledOnce();
  });

  it("tells the route the session is no longer valid when the core finds nobody signed in", async () => {
    const { dialog, onSessionInvalid } = await renderPanel({
      convert: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(confirmButton(dialog));

    expect(onSessionInvalid).toHaveBeenCalledOnce();
  });

  it.each<[ConvertPaidOrderIntoRefundOutcome["kind"], string]>([
    ["unreachable", "No hay conexión con la nube. Probá de nuevo cuando vuelva."],
    ["refused", "La nube no aceptó pasar el cobro a reembolso. Probá de nuevo más tarde."],
    ["not_permitted", "No tenés permiso para pasar un cobro a reembolso."],
    [
      "rebuilt_sale_open",
      "Ya hay una venta armada con este cobro. Volvé a esa venta o cancelala antes de pasarlo a reembolso.",
    ],
    ["unavailable", "No se pudo pasar el cobro a reembolso. Probá de nuevo."],
  ])("keeps the panel open and says why on %s", async (kind, message) => {
    const { screen, dialog, onConverted, onGone } = await renderPanel({
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
    const { dialog, onConverted } = await renderPanel({ convert });

    await userEvent.click(confirmButton(dialog));
    await expect
      .element(dialog.getByText("No se pudo pasar el cobro a reembolso. Probá de nuevo.").first())
      .toBeVisible();
    await userEvent.click(confirmButton(dialog));

    await expect.poll(() => onConverted.mock.calls.length).toBe(1);
  });

  it("sends one request, disables its buttons and ignores Esc while the first is being answered", async () => {
    const answer = deferred<ConvertPaidOrderIntoRefundOutcome>();
    const { dialog, convert, onClose } = await renderPanel({ convert: () => answer.promise });

    await userEvent.click(confirmButton(dialog));
    await expect.element(confirmButton(dialog)).toBeDisabled();
    await expect.element(dialog.getByRole("button", { name: "Cerrar con Esc" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");

    expect(convert).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
