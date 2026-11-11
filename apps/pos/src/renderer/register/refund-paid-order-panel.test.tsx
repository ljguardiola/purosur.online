import type { ConvertPaidOrderIntoRefundOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { OpenSessionRail } from "../shell/open-session-rail";
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

async function renderPanel(
  options: { convert?: Convert; method?: "QR" | "POINT"; withRail?: boolean } = {},
) {
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
    <RegisterFrame
      background="surface"
      rail={
        options.withRail === true ? (
          <OpenSessionRail lock={() => {}} current="sale" abilities={[]} />
        ) : null
      }
    >
      <RefundPaidOrderPanel
        order={{ ...ORDER, method: options.method ?? ORDER.method }}
        convertPaidOrderIntoRefund={convert}
        {...handlers}
      />
    </RegisterFrame>,
  );
  const panel = screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" });
  return { screen, panel, convert, ...handlers };
}

function confirmButton(panel: Awaited<ReturnType<typeof renderPanel>>["panel"]) {
  return panel.getByRole("button", { name: "Pasar a reembolso" });
}

describe("RefundPaidOrderPanel", () => {
  it("shows the amount and time of the payment and what it becomes", async () => {
    const { screen, panel } = await renderPanel();

    await expect.element(panel.getByText("Cobro con QR")).toBeVisible();
    await expect.element(panel.getByText("$ 800,00")).toBeVisible();
    await expect.element(panel.getByText("Cobrado a las")).toBeVisible();
    await expect.element(panel.getByText("15:30")).toBeVisible();
    await expect.element(panel.getByText("Pasa a ser")).toBeVisible();
    await expect.element(panel.getByText("Reembolso pendiente")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the payment method of the Point terminal", async () => {
    const { panel } = await renderPanel({ method: "POINT" });

    await expect.element(panel.getByText("Cobro con Point")).toBeVisible();
  });

  it("has an Esc close and no Volver button nor explanation", async () => {
    const { panel } = await renderPanel();

    await expect.element(panel.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await expect.element(panel.getByRole("button", { name: "Volver" })).not.toBeInTheDocument();
    await expect.element(panel.getByText(/no se le cobra de nuevo/)).not.toBeInTheDocument();
  });

  it("sends one request when the confirmation is pressed twice before the panel shows it is sending", async () => {
    const answer = deferred<ConvertPaidOrderIntoRefundOutcome>();
    const { panel, convert, onConverted } = await renderPanel({ convert: () => answer.promise });
    const confirm = confirmButton(panel).element() as HTMLElement;

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
    const { panel, convert, onClose } = await renderPanel();

    await userEvent.click(panel.getByRole("button", { name: "Cerrar con Esc" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(convert).not.toHaveBeenCalled();
  });

  it("passes the order to refund when Enter is pressed as soon as the panel opens", async () => {
    const { convert, onConverted } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(onConverted).toHaveBeenCalledOnce());
    expect(convert).toHaveBeenCalledExactlyOnceWith("tx-1");
  });

  it.each<ConvertPaidOrderIntoRefundOutcome["kind"]>(["converted", "already_resolved"])(
    "tells the screen the order is resolved when the core answers %s",
    async (kind) => {
      const { panel, convert, onConverted } = await renderPanel({
        convert: async () => ({ kind }),
      });

      await userEvent.click(confirmButton(panel));

      expect(convert).toHaveBeenCalledOnce();
      expect(convert).toHaveBeenCalledWith("tx-1");
      expect(onConverted).toHaveBeenCalledOnce();
    },
  );

  it("tells the screen when the core finds no such paid order", async () => {
    const { panel, onGone } = await renderPanel({ convert: async () => ({ kind: "not_found" }) });

    await userEvent.click(confirmButton(panel));

    expect(onGone).toHaveBeenCalledOnce();
  });

  it("tells the route the session is no longer valid when the core finds nobody signed in", async () => {
    const { panel, onSessionInvalid } = await renderPanel({
      convert: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(confirmButton(panel));

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
    const { screen, panel, onConverted, onGone } = await renderPanel({
      convert: async () => ({ kind }),
    });

    await userEvent.click(confirmButton(panel));

    await expect.element(panel.getByText(message).first()).toBeVisible();
    expect(onConverted).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says it could not pass the order when the request itself fails, and lets the person try again", async () => {
    const convert = vi
      .fn<Convert>()
      .mockRejectedValueOnce(new Error("the core could not answer"))
      .mockResolvedValue({ kind: "converted" });
    const { panel, onConverted } = await renderPanel({ convert });

    await userEvent.click(confirmButton(panel));
    await expect
      .element(panel.getByText("No se pudo pasar el cobro a reembolso. Probá de nuevo.").first())
      .toBeVisible();
    await userEvent.click(confirmButton(panel));

    await expect.poll(() => onConverted.mock.calls.length).toBe(1);
  });

  it("sends one request, disables its buttons and ignores Esc while the first is being answered", async () => {
    const answer = deferred<ConvertPaidOrderIntoRefundOutcome>();
    const { panel, convert, onClose } = await renderPanel({ convert: () => answer.promise });

    await userEvent.click(confirmButton(panel));
    await expect.element(confirmButton(panel)).toBeDisabled();
    await expect.element(panel.getByRole("button", { name: "Cerrar con Esc" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");

    expect(convert).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps Esc from leaving the screen through the frame while the first request is being answered", async () => {
    const answer = deferred<ConvertPaidOrderIntoRefundOutcome>();
    const { screen, panel, onClose } = await renderPanel({
      convert: () => answer.promise,
      withRail: true,
    });

    await userEvent.click(confirmButton(panel));
    await expect.element(confirmButton(panel)).toBeDisabled();
    await userEvent.keyboard("{Escape}");

    expect(screen.router.state.location.pathname).toBe("/");
    expect(onClose).not.toHaveBeenCalled();
  });
});
